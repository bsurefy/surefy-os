// SPDX-License-Identifier: MIT

/** One server-sent event as it arrived: the name, the id and the joined `data:` lines. */
export interface RawEvent {
  event: string
  id: string | null
  data: string
}

/**
 * Reads a `text/event-stream` body and calls `onEvent` for each complete event. Handles events split
 * across chunks, `\r\n` line ends, several `data:` lines and comment lines (keep-alives).
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: RawEvent) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = 'message'
  let id: string | null = null
  let data: string[] = []

  const dispatch = () => {
    if (data.length > 0) onEvent({ event, id, data: data.join('\n') })
    event = 'message'
    data = []
  }

  const handleLine = (line: string) => {
    if (line === '') {
      dispatch()
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
    else if (field === 'id') id = value
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r\n|\r|\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  }
  buffer += decoder.decode()
  if (buffer !== '') handleLine(buffer)
  dispatch()
}
