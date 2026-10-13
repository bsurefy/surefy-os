// SPDX-License-Identifier: AGPL-3.0-only
export { createConnectionsModule, type ConnectionsModule } from './connections.module.js'
export {
  CONNECTIONS_JOBS,
  LAST_USED_FLUSH_EVERY_MS,
  REFRESH_EVERY_MS,
} from './connections.constants.js'
export type {
  ConnectionsContext,
  ConnectionDependents,
  ConnectionPrincipal,
} from './connections.types.js'
export type { ConnectionUse } from './connections.service.js'
export { OutboundError, type HttpResult, type OutboundHttp } from './connectionsHttp.js'
export { authHeaders as connectionAuthHeaders } from './providers/providerHttp.js'
