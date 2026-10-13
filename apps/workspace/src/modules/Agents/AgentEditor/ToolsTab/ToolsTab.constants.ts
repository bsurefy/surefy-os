// SPDX-License-Identifier: AGPL-3.0-only

/** Connections listed in the pickers come from the first page of this size. */
export const CONNECTION_LOOKUP_LIMIT = 100

/** The picker value that stands for "no connection". */
export const NO_CONNECTION = 'none'

/** The "Same as the tool" choice of a discovered action's permission. */
export const INHERIT_PERMISSION = 'inherit'

/** The connection kind each buildable tool kind picks from. */
export const CONNECTION_KIND_OF_TOOL = { api: 'api_tool', mcp: 'mcp_server' } as const

/** The app a new connection starts with when it is added from a tool. */
export const CONNECTION_PROVIDER_OF_TOOL = { api: 'http', mcp: 'mcp' } as const
