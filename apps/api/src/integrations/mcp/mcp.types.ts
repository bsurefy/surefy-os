// SPDX-License-Identifier: AGPL-3.0-only

// What the MCP client needs from the outside (integrations.md, §8). The client never opens a
// connection itself: `send` is the safe outbound client, so every address is checked there.

export interface McpHttpRequest {
  method: 'POST' | 'DELETE'
  headers: Record<string, string>
  body?: string
  timeoutMs: number
}

export interface McpHttpResponse {
  status: number
  /** Header names in lower case. */
  headers: Record<string, string>
  text: string
}

export type McpSend = (url: string, request: McpHttpRequest) => Promise<McpHttpResponse>

/** The server to talk to: its address and the headers that authenticate the call. */
export interface McpServer {
  url: string
  headers: Readonly<Record<string, string>>
}

/** One tool the server offers, as `tools/list` describes it. */
export interface McpToolInfo {
  name: string
  description: string
  /** JSON Schema of the arguments; an empty object schema when the server sends none. */
  inputSchema: Record<string, unknown>
  title: string | null
  /** The server's own hints; `null` when it says nothing. */
  readOnlyHint: boolean | null
  destructiveHint: boolean | null
}

export interface McpCallResult {
  /** Text, with a short placeholder for every part that is not text. */
  text: string
  structuredContent: unknown
  /** The tool ran and reported a failure (`isError`); the text says why. */
  isError: boolean
}
