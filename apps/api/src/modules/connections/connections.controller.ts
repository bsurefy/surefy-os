// SPDX-License-Identifier: AGPL-3.0-only
import type {
  completeOauthRoute,
  connectionImpactRoute,
  createConnectionRoute,
  getConnectionRoute,
  listConnectionsRoute,
  listProvidersRoute,
  reconnectConnectionRoute,
  revokeConnectionRoute,
  startOauthRoute,
  testConnectionRoute,
  updateConnectionRoute,
} from './connections.schema.js'
import type { ConnectionsService } from './connections.service.js'
import type { ConnectionsOauth } from './connectionsOauth.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListProviders = typeof listProvidersRoute
type ListConnections = typeof listConnectionsRoute
type CreateConnection = typeof createConnectionRoute
type StartOauth = typeof startOauthRoute
type CompleteOauth = typeof completeOauthRoute
type GetConnection = typeof getConnectionRoute
type UpdateConnection = typeof updateConnectionRoute
type ConnectionImpact = typeof connectionImpactRoute
type ReconnectConnection = typeof reconnectConnectionRoute
type TestConnection = typeof testConnectionRoute
type RevokeConnection = typeof revokeConnectionRoute

export class ConnectionsController {
  constructor(
    private readonly service: ConnectionsService,
    private readonly oauth: ConnectionsOauth,
  ) {}

  providers = async (request: ZodRequest<ListProviders>, reply: ZodReply<ListProviders>) => {
    reply.ok(await this.service.providers(request.tenant))
  }

  list = async (request: ZodRequest<ListConnections>, reply: ZodReply<ListConnections>) => {
    const { items, nextCursor } = await this.service.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  create = async (request: ZodRequest<CreateConnection>, reply: ZodReply<CreateConnection>) => {
    reply.created(await this.service.create(request.tenant, request.body))
  }

  startOauth = async (request: ZodRequest<StartOauth>, reply: ZodReply<StartOauth>) => {
    reply.ok(await this.oauth.start(request.tenant, request.body))
  }

  completeOauth = async (request: ZodRequest<CompleteOauth>, reply: ZodReply<CompleteOauth>) => {
    reply.ok(await this.oauth.complete(request.tenant, request.body))
  }

  get = async (request: ZodRequest<GetConnection>, reply: ZodReply<GetConnection>) => {
    reply.ok(await this.service.get(request.tenant, request.params.connectionId))
  }

  update = async (request: ZodRequest<UpdateConnection>, reply: ZodReply<UpdateConnection>) => {
    reply.ok(await this.service.update(request.tenant, request.params.connectionId, request.body))
  }

  impact = async (request: ZodRequest<ConnectionImpact>, reply: ZodReply<ConnectionImpact>) => {
    reply.ok(await this.service.impact(request.tenant, request.params.connectionId))
  }

  reconnect = async (
    request: ZodRequest<ReconnectConnection>,
    reply: ZodReply<ReconnectConnection>,
  ) => {
    reply.ok(
      await this.service.reconnect(request.tenant, request.params.connectionId, request.body),
    )
  }

  test = async (request: ZodRequest<TestConnection>, reply: ZodReply<TestConnection>) => {
    reply.ok(await this.service.test(request.tenant, request.params.connectionId))
  }

  revoke = async (request: ZodRequest<RevokeConnection>, reply: ZodReply<RevokeConnection>) => {
    reply.ok(await this.service.revoke(request.tenant, request.params.connectionId))
  }
}
