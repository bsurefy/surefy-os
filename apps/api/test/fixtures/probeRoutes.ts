// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { NotFoundError, UnauthorizedError } from '@/core/errors/index.js'
import { defineGuard } from '@/plugins/access.plugin.js'
import { ERROR_CODES, okResponse } from '@surefy/contracts'

import { probeItems } from './probe.tables.js'

import type { Database } from '@/core/database/index.js'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/** Stands in for a session and its membership: the organization the caller belongs to. */
export const PROBE_ACTOR_HEADER = 'x-probe-org'

export const probeItemSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
})

const actorOrg = (request: FastifyRequest): string => {
  const value = request.headers[PROBE_ACTOR_HEADER]
  if (typeof value !== 'string') throw new UnauthorizedError()
  return value
}

/** A guard that verifies `:orgId` against the probe header, as `app.authorize()` does. */
const probeAuthorize = defineGuard('authorize', (request) => {
  const { orgId } = request.params as { orgId: string }
  if (actorOrg(request) !== orgId) {
    return Promise.reject(
      new NotFoundError(ERROR_CODES.ORGANIZATION_NOT_FOUND, 'Organization not found'),
    )
  }
  return Promise.resolve()
})

/** A broken guard: it wants a caller but never checks the organization. */
const leakyAuthorize = defineGuard('authorize', (request) => {
  actorOrg(request)
  return Promise.resolve()
})

/**
 * Two org-scoped routes over the probe table: one written as every route must be (tenant
 * verified, data read under `db.tenant`), and one with the mistakes the isolation helpers exist
 * to catch (no tenant check, data read under `db.system`).
 */
export const createProbeRoutes =
  (db: Database): FastifyPluginAsyncZod =>
  (app) => {
    const params = z.object({ orgId: z.uuid(), probeId: z.uuid() })
    const response = { 200: okResponse(probeItemSchema) }

    app.get(
      '/orgs/:orgId/probes/:probeId',
      { preHandler: probeAuthorize, schema: { tags: ['probes'], params, response } },
      async (request, reply) => {
        const { orgId, probeId } = request.params
        const rows = await db.tenant(orgId, (tx) =>
          tx.select().from(probeItems).where(eq(probeItems.id, probeId)),
        )
        const row = rows[0]
        if (row === undefined) throw new NotFoundError()
        reply.ok(row)
      },
    )

    app.get(
      '/orgs/:orgId/leaky/:probeId',
      { preHandler: leakyAuthorize, schema: { tags: ['probes'], params, response } },
      async (request, reply) => {
        const rows = await db.system('test', (tx) =>
          tx.select().from(probeItems).where(eq(probeItems.id, request.params.probeId)),
        )
        const row = rows[0]
        if (row === undefined) throw new NotFoundError()
        reply.ok(row)
      },
    )

    return Promise.resolve()
  }
