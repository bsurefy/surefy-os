// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  getAuditEntryRoute,
  getAuditIntegrityRoute,
  listAuditEntriesRoute,
  verifyAuditRoute,
} from './audit.schema.js'

import type { AuditController } from './audit.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function auditRoutes(controller: AuditController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.AUDIT_READ)
    app.get(
      '/orgs/:orgId/audit/entries',
      { schema: listAuditEntriesRoute, preHandler: read },
      controller.list,
    )
    app.get(
      '/orgs/:orgId/audit/entries/:entryId',
      { schema: getAuditEntryRoute, preHandler: read },
      controller.get,
    )
    app.get(
      '/orgs/:orgId/audit/integrity',
      { schema: getAuditIntegrityRoute, preHandler: read },
      controller.integrity,
    )
    app.post(
      '/orgs/:orgId/audit/verify',
      { schema: verifyAuditRoute, preHandler: read },
      controller.verify,
    )
    return Promise.resolve()
  }
}
