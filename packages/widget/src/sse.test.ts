// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest'

import { readEventStream, type RawEvent } from './sse.js'

const bodyOf = (text: string, chunkSize = 3) => {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}

const read = async (text: string, chunkSize?: number) => {
  const events: RawEvent[] = []
  await readEventStream(bodyOf(text, chunkSize), (event) => events.push(event))
  return events
}

describe('readEventStream', () => {
  it('reads named events with ids across chunk boundaries', async () => {
    expect(
      await read('id: 1-0\nevent: run\ndata: {"runId":"r"}\n\nevent: done\ndata: {}\n\n'),
    ).toEqual([
      { event: 'run', id: '1-0', data: '{"runId":"r"}' },
      { event: 'done', id: '1-0', data: '{}' },
    ])
  })

  it('handles CRLF line ends, several data lines and keep-alive comments', async () => {
    expect(
      await read(': keep-alive\r\n\r\nevent: text-delta\r\ndata: a\r\ndata: b\r\n\r\n', 5),
    ).toEqual([{ event: 'text-delta', id: null, data: 'a\nb' }])
  })

  it('keeps multi-byte characters split between chunks', async () => {
    expect(await read('event: text-delta\ndata: "héllo ✓"\n\n', 1)).toEqual([
      { event: 'text-delta', id: null, data: '"héllo ✓"' },
    ])
  })

  it('delivers a last event without the closing blank line', async () => {
    expect(await read('event: done\ndata: {}')).toEqual([{ event: 'done', id: null, data: '{}' }])
  })
})
