// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  apiKeyImpactRoute,
  createApiKeyRoute,
  getApiKeyRoute,
  listApiKeysRoute,
  revokeApiKeyRoute,
  updateApiKeyRoute,
} from './apiKeys.schema.js'

import type { ApiKeysController } from './apiKeys.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * Key management is for signed-in Admins and Owners. A key itself can never reach these routes:
 * `api-keys:manage` is not a scope keys may carry.
 */
export function apiKeysRoutes(controller: ApiKeysController): FastifyPluginAsyncZod {
  return (app) => {
    const manage = app.authorize(PERMISSIONS.API_KEYS_MANAGE)
    app.get(
      '/orgs/:orgId/api-keys',
      { schema: listApiKeysRoute, preHandler: manage },
      controller.list,
    )
    app.post(
      '/orgs/:orgId/api-keys',
      { schema: createApiKeyRoute, preHandler: manage },
      controller.create,
    )
    app.get(
      '/orgs/:orgId/api-keys/:keyId',
      { schema: getApiKeyRoute, preHandler: manage },
      controller.get,
    )
    app.patch(
      '/orgs/:orgId/api-keys/:keyId',
      { schema: updateApiKeyRoute, preHandler: manage },
      controller.update,
    )
    app.get(
      '/orgs/:orgId/api-keys/:keyId/impact',
      { schema: apiKeyImpactRoute, preHandler: manage },
      controller.impact,
    )
    app.post(
      '/orgs/:orgId/api-keys/:keyId/revoke',
      { schema: revokeApiKeyRoute, preHandler: manage },
      controller.revoke,
    )
    return Promise.resolve()
  }
}
