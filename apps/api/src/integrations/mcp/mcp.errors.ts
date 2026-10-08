// SPDX-License-Identifier: AGPL-3.0-only

export type McpFailure =
  /** The server refused the credentials (HTTP 401 or 403). */
  | 'unauthorized'
  /** The server answered something that is not MCP over Streamable HTTP. */
  | 'protocol'
  /** The server speaks a protocol version this client does not. */
  | 'unsupported'
  /** The server answered a JSON-RPC error (an unknown tool, bad arguments, an internal failure). */
  | 'rpc'
  /** Any other HTTP failure. */
  | 'http'

/** The server was reached and answered, but not with a result. Transport failures are the sender's. */
export class McpError extends Error {
  constructor(
    readonly kind: McpFailure,
    message: string,
    readonly status: number | null = null,
    /** The JSON-RPC error code, for `rpc`. */
    readonly rpcCode: number | null = null,
  ) {
    super(message)
    this.name = 'McpError'
  }
}
