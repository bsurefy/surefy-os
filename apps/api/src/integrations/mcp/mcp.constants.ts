// SPDX-License-Identifier: AGPL-3.0-only

/** The version this client asks for, and the ones it understands when the server answers lower. */
export const MCP_PROTOCOL_VERSION = '2025-06-18'
export const MCP_SUPPORTED_VERSIONS: readonly string[] = [MCP_PROTOCOL_VERSION, '2025-03-26']

/** One request to the server (the call as a whole has its own deadline in `agentTools`). */
export const MCP_REQUEST_TIMEOUT_MS = 30_000

/** Tools kept from a server: the most an agent definition can hold (`discoveredActions`). */
export const MCP_TOOLS_MAX = 200
/** Pages of `tools/list` read before giving up on a server that never ends the list. */
export const MCP_LIST_PAGES_MAX = 10
