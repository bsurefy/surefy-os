// SPDX-License-Identifier: AGPL-3.0-only
import { orgKey } from '@/core/cache/keys.js'
import { AppError } from '@/core/errors/index.js'
import { outboxHandler } from '@/modules/outbox/index.js'
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import type { PublicRunOutput } from '@surefy/contracts'

import { CHANNEL_HISTORY_MESSAGE_MAX_LENGTH } from './agentPublishing.constants.js'
import { openChannelConnection } from './agentPublishing.inbound.js'
import { channelContext } from './agentPublishing.intake.js'
import {
  ReplyFailedError,
  sendSlackReply,
  sendWhatsappMessage,
} from './agentPublishing.providers.js'

import type { ChannelHistory } from './agentPublishing.history.js'
import type { InboundChannelsDeps } from './agentPublishing.inbound.js'
import type { AgentChannelsRepository, ChannelRow } from './agentPublishing.repository.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AgentRunsModule, AgentRunsQueries, StepRow } from '@/modules/agentRuns/index.js'
import type { OutboundHttp } from '@/modules/connections/index.js'
import type { EffectiveAccess } from '@/types/context.js'

/** What a person reads when the agent could not answer. */
export const FAILED_REPLY = "Sorry, I couldn't answer that. Please try again later."

/** How long a sent reply is remembered: the outbox delivers at least once. */
const REPLY_DEDUPE_SECONDS = 24 * 60 * 60

export interface ChannelRepliesDeps {
  db: Database
  cache: Pick<Cache, 'client'>
  logger: Logger
  repository: AgentChannelsRepository
  runs: {
    repository: Pick<AgentRunsModule['repository'], 'findRun'>
    queries: Pick<AgentRunsQueries, 'getPublic' | 'stepsOf'>
  }
  access: { forOrganization(orgId: string): Promise<EffectiveAccess | null> }
  connections: InboundChannelsDeps['connections']
  http: OutboundHttp
  history: ChannelHistory
  /** Stub servers that stand in for Slack and WhatsApp, in end-to-end runs. */
  origins?: { slack?: string; whatsapp?: string }
}

/** Where the answer goes, from the run's `externalRef`. */
type ReplyTarget =
  | { type: 'slack'; channel: string; thread: string; conversation: string }
  | { type: 'whatsapp'; to: string; conversation: string }

export function replyTargetOf(externalRef: string | null): ReplyTarget | null {
  if (externalRef === null) return null
  const [type, first, second] = externalRef.split(':')
  if (type === 'slack' && first !== undefined && second !== undefined) {
    return { type, channel: first, thread: second, conversation: `${first}:${second}` }
  }
  if (type === 'whatsapp' && first !== undefined) return { type, to: first, conversation: first }
  return null
}

/** The answer with its numbered sources: Slack and WhatsApp show plain text. */
export function replyText(output: PublicRunOutput | null): string {
  const text = output?.text.trim() ?? ''
  if (text === '') return FAILED_REPLY
  const sources = output?.sources ?? []
  if (sources.length === 0) return text
  const lines = sources.map(
    (source, index) =>
      `${String(index + 1)}. ${source.title}` +
      (source.page === null ? '' : ` (p. ${String(source.page)})`),
  )
  return `${text}\n\nSources:\n${lines.join('\n')}`
}

const externalRefOf = (steps: readonly StepRow[]): string | null => {
  const first = steps.find((step) => step.seq === 1)
  const input = first?.input
  return input?.kind === 'model' && input.run !== undefined ? input.run.externalRef : null
}

/**
 * Delivers the answers of Slack and WhatsApp runs when `agent_run.finished` arrives
 * (backend/agent-runs.md, §3): the final text in the thread or the chat, or a short apology when
 * the run failed. A connection the app refuses moves its channels to `error`, shown with
 * Reconnect; so does `connection.expired`.
 */
export class ChannelReplies {
  constructor(private readonly deps: ChannelRepliesDeps) {}

  async onRunFinished(orgId: string, runId: string, status: string): Promise<void> {
    if (status === 'canceled') return
    const found = await this.deps.db.tenant(orgId, async (tx) => {
      const run = await this.deps.runs.repository.findRun(tx, orgId, runId)
      if (run?.channelId == null || (run.trigger !== 'slack' && run.trigger !== 'whatsapp')) {
        return
      }
      const channel = await this.deps.repository.findInOrg(tx, orgId, run.channelId)
      return channel === undefined ? undefined : { run, channel }
    })
    if (found === undefined || found.channel.status === 'disconnected') return
    const { run, channel } = found
    const access = await this.deps.access.forOrganization(orgId)
    if (access === null) return
    const ctx = channelContext(orgId, channel.id, access)
    const target = replyTargetOf(externalRefOf(await this.deps.runs.queries.stepsOf(ctx, run)))
    if (target === null) return
    if (!(await this.claim(orgId, run.id))) return

    const succeeded = run.status === 'succeeded'
    const text = succeeded
      ? replyText((await this.deps.runs.queries.getPublic(ctx, run.id)).output)
      : FAILED_REPLY
    try {
      await this.send(orgId, channel, target, text)
    } catch (error) {
      if (await this.channelFailed(orgId, channel, error)) return
      // not delivered: the outbox tries again
      await this.release(orgId, run.id)
      throw error
    }
    if (succeeded) {
      await this.deps.history.append(orgId, channel.id, target.conversation, {
        role: 'assistant',
        text: text.slice(0, CHANNEL_HISTORY_MESSAGE_MAX_LENGTH),
      })
    }
  }

  /** The channels of an expired connection go to `error` until it is reconnected. */
  async onConnectionExpired(orgId: string, connectionId: string): Promise<void> {
    await this.deps.db.tenant(orgId, async (tx) => {
      for (const channel of await this.deps.repository.listByConnection(tx, orgId, connectionId)) {
        if (channel.status !== 'active') continue
        await this.deps.repository.update(tx, orgId, channel.id, {
          status: 'error',
          lastErrorCode: CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED,
        })
      }
    })
  }

  handlers() {
    return [
      outboxHandler('agent_run.finished', 'agent-publishing.reply', async (delivery) => {
        if (delivery.orgId === null) return
        await this.onRunFinished(delivery.orgId, delivery.payload.id, delivery.payload.status)
      }),
      outboxHandler(
        'connection.expired',
        'agent-publishing.connection-expired',
        async (delivery) => {
          if (delivery.orgId === null) return
          await this.onConnectionExpired(delivery.orgId, delivery.payload.id)
        },
      ),
    ]
  }

  private async send(
    orgId: string,
    channel: ChannelRow,
    target: ReplyTarget,
    text: string,
  ): Promise<void> {
    const connection = await openChannelConnection(this.deps.connections, orgId, channel)
    const token = target.type === 'slack' ? connection.secret.accessToken : connection.secret.token
    if (target.type === 'slack') {
      await sendSlackReply(
        this.deps.http,
        { token: token ?? '', channel: target.channel, thread: target.thread, text },
        this.deps.origins?.slack,
      )
      return
    }
    await sendWhatsappMessage(
      this.deps.http,
      {
        token: token ?? '',
        phoneNumberId: channel.externalAccountId ?? '',
        to: target.to,
        text,
      },
      this.deps.origins?.whatsapp,
    )
  }

  /**
   * The connection is unusable or refused by the app: the channel goes to `error` with the reason
   * and the answer is dropped (retrying would not help). Anything else is not handled here.
   */
  private async channelFailed(
    orgId: string,
    channel: ChannelRow,
    error: unknown,
  ): Promise<boolean> {
    let code: string | null = null
    if (error instanceof ReplyFailedError && error.rejected) {
      code = CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED
    } else if (error instanceof AppError && error.code.startsWith('CONNECTION_')) {
      code = error.code
    } else if (error instanceof ReplyFailedError) {
      // the app answered with an error about this message (a closed thread, a blocked number)
      this.deps.logger.warn({ channelId: channel.id, code: error.code }, 'channel reply refused')
      return true
    }
    if (code === null) return false
    this.deps.logger.warn({ channelId: channel.id, code }, 'channel connection failed')
    await this.deps.db.tenant(orgId, (tx) =>
      this.deps.repository.update(tx, orgId, channel.id, { status: 'error', lastErrorCode: code }),
    )
    return true
  }

  private replyKey = (orgId: string, runId: string) => orgKey(orgId, 'channel-reply', runId)

  /** One reply per run, however often the event is delivered; Redis down: send anyway. */
  private async claim(orgId: string, runId: string): Promise<boolean> {
    try {
      const set = await this.deps.cache.client.set(
        this.replyKey(orgId, runId),
        '1',
        'EX',
        REPLY_DEDUPE_SECONDS,
        'NX',
      )
      return set === 'OK'
    } catch {
      return true
    }
  }

  private async release(orgId: string, runId: string): Promise<void> {
    await this.deps.cache.client.del(this.replyKey(orgId, runId)).catch(() => 0)
  }
}
