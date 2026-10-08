// SPDX-License-Identifier: AGPL-3.0-only
import { McpError } from './mcp.errors.js'

/** A JSON-RPC response as it arrives; `result` and `error` are checked by the caller. */
export interface RpcMessage {
  id?: number | string | null
  result?: unknown
  error?: { code?: unknown; message?: unknown }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function asMessage(value: unknown): RpcMessage | null {
  return isObject(value) && ('result' in value || 'error' in value) ? value : null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** The `data:` payloads of an event stream, one string per event. */
function eventData(text: string): string[] {
  return text
    .replaceAll('\r\n', '\n')
    .split('\n\n')
    .map((event) =>
      event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n'),
    )
    .filter((data) => data !== '')
}

/**
 * The response to request `id` from a Streamable HTTP answer: one JSON document, or an event
 * stream whose events may also carry notifications and requests of the server, which are skipped.
 */
export function readRpcResponse(contentType: string, text: string, id: number): RpcMessage {
  const payloads = contentType.toLowerCase().includes('text/event-stream')
    ? eventData(text).map(parseJson)
    : [parseJson(text)]
  for (const payload of payloads.flatMap((value): unknown[] =>
    Array.isArray(value) ? (value as unknown[]) : [value],
  )) {
    const message = asMessage(payload)
    if (message !== null && message.id === id) return message
  }
  throw new McpError('protocol', 'The server did not answer the request')
}
