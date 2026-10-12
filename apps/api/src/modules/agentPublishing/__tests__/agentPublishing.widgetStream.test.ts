// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { widgetScriptLoader } from '../agentPublishing.script.js'
import { widgetStream } from '../agentPublishing.widgetStream.js'

const RUN_ID = '0198f2c0-0000-7000-8000-000000000001'

/** The run stream as the agent runs module writes it: `id:` lines, `data:` JSON, `[DONE]`. */
const runFrames = (...frames: (readonly [string | null, unknown] | string)[]): string =>
  frames
    .map((entry) => {
      if (typeof entry === 'string') return entry
      const [id, chunk] = entry
      return (id === null ? '' : `id: ${id}\n`) + `data: ${JSON.stringify(chunk)}\n\n`
    })
    .join('')

/** A source that hands the text over in pieces of `size`, to cut frames apart. */
const sourceOf = (text: string, size = 7): ReadableStream<Uint8Array> => {
  const bytes = new TextEncoder().encode(text)
  let at = 0
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(at, at + size))
      at += size
    },
  })
}

interface Event {
  event: string
  id: string | null
  data: unknown
}

async function eventsOf(
  stream: ReadableStream<Uint8Array>,
): Promise<{ events: Event[]; raw: string }> {
  const raw = await new Response(stream).text()
  const events = raw
    .split('\n\n')
    .filter((frame) => frame.startsWith('event: '))
    .map((frame) => {
      const lines = frame.split('\n')
      const value = (name: string) =>
        lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? null
      return {
        event: value('event') ?? '',
        id: value('id'),
        data: JSON.parse(value('data') ?? 'null') as unknown,
      }
    })
  return { events, raw }
}

describe('the widget stream', () => {
  it('sends the run, the text, the sources and the final status, nothing of the steps', async () => {
    const text = runFrames(
      ['1-0', { type: 'start', messageId: RUN_ID }],
      ['1-1', { type: 'data-run', data: { runId: RUN_ID, status: 'running', errorCode: null } }],
      ['1-2', { type: 'data-step', data: { seq: 2, name: 'Search knowledge' } }],
      [
        '1-3',
        {
          type: 'source-url',
          sourceId: 'doc-1',
          url: '/knowledge/documents/doc-1',
          title: 'Refund policy',
        },
      ],
      [
        '1-4',
        {
          type: 'source-url',
          sourceId: 'doc-1',
          url: '/knowledge/documents/doc-1',
          title: 'Refund policy',
        },
      ],
      [
        '1-5',
        { type: 'source-url', sourceId: 'web-1', url: 'https://example.com/faq', title: 'FAQ' },
      ],
      ['1-6', { type: 'data-guard', data: { seq: 3 } }],
      ['1-7', { type: 'text-delta', id: RUN_ID, delta: 'Refunds take ' }],
      ': keep-alive\n\n',
      ['1-8', { type: 'text-delta', id: RUN_ID, delta: '5 days.' }],
      ['1-9', { type: 'data-run', data: { runId: RUN_ID, status: 'succeeded', errorCode: null } }],
      ['1-10', { type: 'finish' }],
      'data: [DONE]\n\n',
    )
    const { events, raw } = await eventsOf(widgetStream(RUN_ID, sourceOf(text)))

    expect(events).toEqual([
      { event: 'run', id: null, data: { runId: RUN_ID } },
      {
        event: 'source',
        id: '1-3',
        data: { index: 1, title: 'Refund policy', page: null, url: null },
      },
      {
        event: 'source',
        id: '1-5',
        data: { index: 2, title: 'FAQ', page: null, url: 'https://example.com/faq' },
      },
      { event: 'text-delta', id: '1-7', data: { delta: 'Refunds take ' } },
      { event: 'text-delta', id: '1-8', data: { delta: '5 days.' } },
      { event: 'done', id: '1-9', data: { status: 'succeeded', errorCode: null } },
    ])
    expect(raw).toContain(': keep-alive')
    expect(raw).not.toContain('Search knowledge')
  })

  it('says when the run waits for a person, and passes a failure code on', async () => {
    const waiting = runFrames(
      [
        '2-0',
        { type: 'data-run', data: { runId: RUN_ID, status: 'waiting_approval', errorCode: null } },
      ],
      [
        '2-1',
        { type: 'data-approval-required', data: { approvalId: 'a', title: 'Refund 120 EUR' } },
      ],
      'data: [DONE]\n\n',
    )
    const first = await eventsOf(widgetStream(RUN_ID, sourceOf(waiting)))
    expect(first.events.map((event) => event.event)).toEqual(['run', 'waiting-approval'])
    expect(first.raw).not.toContain('Refund 120 EUR')

    const failed = runFrames(
      [
        null,
        {
          type: 'data-run',
          data: { runId: RUN_ID, status: 'failed', errorCode: 'MODEL_UNAVAILABLE' },
        },
      ],
      [null, { type: 'error', errorText: 'MODEL_UNAVAILABLE' }],
      [null, { type: 'finish' }],
      'data: [DONE]\n\n',
    )
    const second = await eventsOf(widgetStream(RUN_ID, sourceOf(failed)))
    expect(second.events.at(-1)).toEqual({
      event: 'done',
      id: null,
      data: { status: 'failed', errorCode: 'MODEL_UNAVAILABLE' },
    })
  })

  it('ends with an error event when the run stream breaks', async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('redis went away'))
      },
    })
    const { events } = await eventsOf(widgetStream(RUN_ID, broken))
    expect(events.at(-1)).toEqual({ event: 'error', id: null, data: { code: 'INTERNAL_ERROR' } })
  })
})

describe('the widget script', () => {
  it('is read once and carries an ETag', async () => {
    let reads = 0
    const load = widgetScriptLoader(() => {
      reads += 1
      return Promise.resolve('console.log("widget")')
    })
    const first = await load()
    const again = await load()
    expect(reads).toBe(1)
    expect(first?.body).toBe('console.log("widget")')
    expect(first?.etag).toMatch(/^"[\w-]{27}"$/)
    expect(again).toBe(first)
  })

  it('is missing when the package was not built, and is looked for again', async () => {
    let reads = 0
    const load = widgetScriptLoader(() => {
      reads += 1
      return Promise.reject(new Error('ENOENT'))
    })
    expect(await load()).toBeNull()
    expect(await load()).toBeNull()
    expect(reads).toBe(2)
  })
})
