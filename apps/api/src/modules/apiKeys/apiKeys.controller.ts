// SPDX-License-Identifier: AGPL-3.0-only
import type {
  apiKeyImpactRoute,
  createApiKeyRoute,
  getApiKeyRoute,
  listApiKeysRoute,
  revokeApiKeyRoute,
  updateApiKeyRoute,
} from './apiKeys.schema.js'
import type { ApiKeysService } from './apiKeys.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListApiKeys = typeof listApiKeysRoute
type CreateApiKey = typeof createApiKeyRoute
type GetApiKey = typeof getApiKeyRoute
type UpdateApiKey = typeof updateApiKeyRoute
type ApiKeyImpact = typeof apiKeyImpactRoute
type RevokeApiKey = typeof revokeApiKeyRoute

export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  list = async (request: ZodRequest<ListApiKeys>, reply: ZodReply<ListApiKeys>) => {
    const { items, nextCursor } = await this.apiKeysService.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  create = async (request: ZodRequest<CreateApiKey>, reply: ZodReply<CreateApiKey>) => {
    reply.created(await this.apiKeysService.create(request.tenant, request.body))
  }

  get = async (request: ZodRequest<GetApiKey>, reply: ZodReply<GetApiKey>) => {
    reply.ok(await this.apiKeysService.get(request.tenant, request.params.keyId))
  }

  update = async (request: ZodRequest<UpdateApiKey>, reply: ZodReply<UpdateApiKey>) => {
    reply.ok(await this.apiKeysService.rename(request.tenant, request.params.keyId, request.body))
  }

  impact = async (request: ZodRequest<ApiKeyImpact>, reply: ZodReply<ApiKeyImpact>) => {
    reply.ok(await this.apiKeysService.impact(request.tenant, request.params.keyId))
  }

  revoke = async (request: ZodRequest<RevokeApiKey>, reply: ZodReply<RevokeApiKey>) => {
    reply.ok(await this.apiKeysService.revoke(request.tenant, request.params.keyId))
  }
}
