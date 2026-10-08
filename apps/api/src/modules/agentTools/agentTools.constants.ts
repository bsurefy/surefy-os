// SPDX-License-Identifier: AGPL-3.0-only

/** What the model reads of one tool answer; the rest is cut and the outcome says `truncated`. */
export const AGENT_TOOL_RESULT_MAX_CHARS = 32_000

/** What the model reads of the body of a failed call. */
export const AGENT_TOOL_ERROR_EXCERPT_CHARS = 2000

/** Pauses before the retries of a call that may be repeated (agent-runs.md, §5). */
export const AGENT_TOOL_RETRY_DELAYS_MS: readonly number[] = [1000, 4000]

/** The longest function name providers accept. */
export const CALL_NAME_MAX = 64

/** How long the arguments an MCP server declared are remembered, and how many servers are kept. */
export const SCHEMA_CACHE_TTL_MS = 5 * 60_000
export const SCHEMA_CACHE_MAX = 200

/** Credential values shorter than this are not masked: they would mangle ordinary text. */
export const SCRUB_MIN_LENGTH = 6
export const REDACTED = '[redacted]'

/** Headers the HTTP client sets itself; a tool cannot override them. */
export const BLOCKED_TOOL_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
  'te',
  'trailer',
  'proxy-authorization',
  'cookie',
])

/** Answers of an API that are worth repeating when the call was read-only. */
export const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504])

/** The provider keys of connections a tool may use (`connections` › provider registry). */
export const API_TOOL_PROVIDER = 'http'
export const MCP_TOOL_PROVIDER = 'mcp'
