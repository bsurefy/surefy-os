// SPDX-License-Identifier: AGPL-3.0-only
import {
  AGENT_RUN_KEEP_ALIVE_SECONDS,
  AGENT_RUN_TERMINAL_STATUSES,
  AGENT_RUN_WAITING_STREAM_MINUTES,
} from '@surefy/contracts'
import type { AgentRunStatus } from '@surefy/contracts'

import { RUN_EVENT_FIELD, runEventsKey } from './agentRuns.events.js'
import { answerOf, stepEvent } from './agentRuns.present.js'

import type { RunEventChunk, RunRow, StepRow } from './agentRuns.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Logger } from '@/core/logger/index.js'

/** What the stream reads from the database: the run's current row and its stored steps. */
export interface RunEventSource {
  current(runId: string): Promise<RunRow | undefined>
  steps(run: RunRow): Promise<StepRow[]>
}

export interface RunEventStreamDeps {
  cache: Pick<Cache, 'client'>
  logger: Logger
  keepAliveMs?: number
  waitingMs?: number
}

export interface OpenRunStream {
  orgId: string
  run: RunRow
  source: RunEventSource
  /** The Redis stream id the client saw last (`Last-Event-ID` or `?after=`). */
  after?: string
}

const STREAM_ID = /^(\d+)-(\d+)$/

/** Before the first entry: the position of a client that has seen nothing. */
const START = '0-0'

const idParts = (id: string): [bigint, bigint] => {
  const match = STREAM_ID.exec(id)
  return match === null ? [0n, 0n] : [BigInt(match[1] ?? '0'), BigInt(match[2] ?? '0')]
}

/** Redis stream ids compare by time, then by sequence. */
const compareIds = (left: string, right: string): number => {
  const [lt, ls] = idParts(left)
  const [rt, rs] = idParts(right)
  if (lt !== rt) return lt < rt ? -1 : 1
  if (ls === rs) return 0
  return ls < rs ? -1 : 1
}

type Entry = [id: string, fields: string[]]

const chunkOf = (entry: Entry): RunEventChunk | undefined => {
  const index = entry[1].indexOf(RUN_EVENT_FIELD)
  const raw = index < 0 ? undefined : entry[1][index + 1]
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as RunEventChunk
  } catch {
    return undefined
  }
}

const isTerminal = (status: AgentRunStatus): boolean =>
  (AGENT_RUN_TERMINAL_STATUSES as readonly string[]).includes(status)

const encoder = new TextEncoder()
const frame = (id: string | null, chunk: RunEventChunk): Uint8Array => {
  const lead = id === null ? '' : 'id: ' + id + '\n'
  return encoder.encode(lead + 'data: ' + JSON.stringify(chunk) + '\n\n')
}
const KEEP_ALIVE = encoder.encode(': keep-alive\n\n')
const DONE = encoder.encode('data: [DONE]\n\n')

/** The `data-run` chunk of a run's status. */
const statusChunk = (run: RunRow): RunEventChunk => ({
  type: 'data-run',
  data: { runId: run.id, status: run.status, errorCode: run.errorCode },
})

/**
 * Events rebuilt from the stored steps for a range Redis no longer holds: one `data-step` per step,
 * the final text without deltas, the status and, for a run that ended, `error` and `finish`
 * (backend/agent-runs.md, §8).
 */
export function replayChunks(run: RunRow, steps: readonly StepRow[]): RunEventChunk[] {
  const chunks: RunEventChunk[] = [{ type: 'start', messageId: run.id }]
  for (const step of steps) chunks.push({ type: 'data-step', data: stepEvent(step) })
  const answer = run.status === 'succeeded' ? answerOf(steps) : null
  if (answer !== null && answer !== '') {
    chunks.push(
      { type: 'text-start', id: run.id },
      { type: 'text-delta', id: run.id, delta: answer },
      { type: 'text-end', id: run.id },
    )
  }
  chunks.push(...closingChunks(run))
  return chunks
}

/** The status and, for a run that ended, the failure and `finish`. */
function closingChunks(run: RunRow): RunEventChunk[] {
  const chunks = [statusChunk(run)]
  if (isTerminal(run.status)) {
    if (run.errorCode !== null) chunks.push({ type: 'error', errorText: run.errorCode })
    chunks.push({ type: 'finish' })
  }
  return chunks
}

/**
 * The reader side of a run's event stream: Server-Sent Events built from the Redis stream the
 * executor writes, with the stored steps as the fallback (backend/agent-runs.md, §8). Closing the
 * stream only ends the reader; the run goes on.
 */
export class RunEventStream {
  private readonly keepAliveMs: number
  private readonly waitingMs: number

  constructor(private readonly deps: RunEventStreamDeps) {
    this.keepAliveMs = deps.keepAliveMs ?? AGENT_RUN_KEEP_ALIVE_SECONDS * 1000
    this.waitingMs = deps.waitingMs ?? AGENT_RUN_WAITING_STREAM_MINUTES * 60_000
  }

  open(request: OpenRunStream): ReadableStream<Uint8Array> {
    const abort = new AbortController()
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        const reader = new RunReader({
          request,
          controller,
          signal: abort.signal,
          cache: this.deps.cache,
          logger: this.deps.logger,
          keepAliveMs: this.keepAliveMs,
          waitingMs: this.waitingMs,
        })
        void reader.run()
      },
      cancel: () => {
        abort.abort()
      },
    })
  }
}

interface RunReaderDeps {
  request: OpenRunStream
  controller: ReadableStreamDefaultController<Uint8Array>
  signal: AbortSignal
  cache: Pick<Cache, 'client'>
  logger: Logger
  keepAliveMs: number
  waitingMs: number
}

/** One connection's read loop: catch up, then follow the live tail until the run ends. */
class RunReader {
  private readonly key: string
  /** The last Redis stream id sent (or skipped) to this client. */
  private last: string
  private finished = false
  private status: AgentRunStatus
  private waitingSince: number | null

  constructor(private readonly deps: RunReaderDeps) {
    const { run, orgId, after } = deps.request
    this.key = runEventsKey(orgId, run.id)
    this.last = after !== undefined && STREAM_ID.test(after) ? after : START
    this.status = run.status
    this.waitingSince = run.status === 'waiting_approval' ? Date.now() : null
  }

  async run(): Promise<void> {
    const { controller, signal, logger, request } = this.deps
    let tail: ReturnType<Cache['client']['duplicate']> | undefined
    try {
      await this.catchUp()
      tail = this.deps.cache.client.duplicate()
      while (!this.finished && !signal.aborted && this.remaining() > 0) {
        await this.follow(tail)
      }
      if (this.waitingSince !== null && !this.finished) this.send(null, this.waitingChunk())
      if (!signal.aborted) {
        controller.enqueue(DONE)
        controller.close()
      }
    } catch (error) {
      logger.error({ err: error, runId: request.run.id }, 'agent run stream failed')
      if (!signal.aborted) controller.error(error)
    } finally {
      tail?.disconnect()
    }
  }

  /** What the client missed: Redis' entries, or the events rebuilt from the steps. */
  private async catchUp(): Promise<void> {
    const { run, source } = this.deps.request
    const [first] = await this.range('-', '+', 1)
    if (this.holdsHistory(first)) {
      for (const entry of await this.range(this.last === START ? '-' : '(' + this.last, '+')) {
        this.handle(entry)
      }
      return
    }
    const current = (await source.current(run.id)) ?? run
    for (const chunk of replayChunks(current, await source.steps(current))) this.send(null, chunk)
    this.status = current.status
    this.finished = isTerminal(current.status)
    this.waitingSince = current.status === 'waiting_approval' ? Date.now() : null
    // from here on only what happens next: the rebuilt events covered the past
    const [newest] = await this.deps.cache.client.xrevrange(this.key, '+', '-', 'COUNT', 1)
    this.last = newest === undefined ? START : newest[0]
  }

  /** Whether Redis still has every event after the client's position. */
  private holdsHistory(first: Entry | undefined): boolean {
    if (first === undefined) return false
    if (this.last === START) return chunkOf(first)?.type === 'start'
    return compareIds(first[0], this.last) <= 0
  }

  /** One blocking read of the tail; on a quiet stretch a keep-alive and a look at the row. */
  private async follow(tail: ReturnType<Cache['client']['duplicate']>): Promise<void> {
    const { signal, logger, request, controller } = this.deps
    const block = Math.max(1, Math.min(this.deps.keepAliveMs, this.remaining()))
    const read = await tail
      .xread('BLOCK', block, 'STREAMS', this.key, this.last)
      .catch((error: unknown) => {
        logger.warn({ err: error, runId: request.run.id }, 'agent run stream read failed')
        return null
      })
    if (signal.aborted) return
    if (read === null) {
      controller.enqueue(KEEP_ALIVE)
      await this.checkRow()
      return
    }
    for (const [, entries] of read) for (const entry of entries as Entry[]) this.handle(entry)
  }

  /** Redis may have lost the final events: the row says whether the run is over. */
  private async checkRow(): Promise<void> {
    const current = await this.deps.request.source.current(this.deps.request.run.id)
    if (current === undefined || !isTerminal(current.status) || isTerminal(this.status)) return
    for (const chunk of closingChunks(current)) this.send(null, chunk)
    this.finished = true
  }

  private handle(entry: Entry): void {
    this.last = entry[0]
    const chunk = chunkOf(entry)
    if (chunk === undefined) return
    this.send(entry[0], chunk)
    if (chunk.type === 'finish') this.finished = true
    const next =
      chunk.type === 'data-run' ? (chunk.data as { status?: AgentRunStatus }).status : undefined
    if (next === undefined) return
    this.status = next
    this.waitingSince = next === 'waiting_approval' ? (this.waitingSince ?? Date.now()) : null
  }

  /** How long a stream of a waiting run may stay open; unlimited otherwise. */
  private remaining(): number {
    return this.waitingSince === null
      ? Number.POSITIVE_INFINITY
      : this.waitingSince + this.deps.waitingMs - Date.now()
  }

  private waitingChunk(): RunEventChunk {
    const { run } = this.deps.request
    return statusChunk({ ...run, status: this.status })
  }

  private send(id: string | null, chunk: RunEventChunk): void {
    if (!this.deps.signal.aborted) this.deps.controller.enqueue(frame(id, chunk))
  }

  private async range(from: string, to: string, count?: number): Promise<Entry[]> {
    const { client } = this.deps.cache
    const entries =
      count === undefined
        ? await client.xrange(this.key, from, to)
        : await client.xrange(this.key, from, to, 'COUNT', count)
    return entries
  }
}

/**
 * The stream as an HTTP response: Server-Sent Events carrying the AI SDK UI message stream, so
 * `useChat` and a plain reader can both consume it. `no-transform` and `x-accel-buffering` keep
 * proxies from buffering it.
 */
export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  })
}
