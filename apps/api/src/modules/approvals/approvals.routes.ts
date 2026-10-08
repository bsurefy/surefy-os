// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  approvalsSummaryRoute,
  approveApprovalRoute,
  bulkDecideRoute,
  cancelApprovalRoute,
  getApprovalRoute,
  listApprovalsRoute,
  rejectApprovalRoute,
} from './approvals.schema.js'

import type { ApprovalsController } from './approvals.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * Approval routes (insights.md › Approvals). Reading needs `approvals:read`, which every role
 * holds; deciding needs `approvals:decide` and an assignee row that names the person, checked by
 * the service. A Builder withdrawing their own request needs only `approvals:read`.
 */
export function approvalsRoutes(c: ApprovalsController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.APPROVALS_READ)
    const decide = app.authorize(PERMISSIONS.APPROVALS_DECIDE)
    const base = '/orgs/:orgId/approvals'
    const one = `${base}/:approvalId`

    app.get(base, { schema: listApprovalsRoute, preHandler: read }, c.list)
    app.get(`${base}/summary`, { schema: approvalsSummaryRoute, preHandler: read }, c.summary)
    app.post(`${base}/bulk-decide`, { schema: bulkDecideRoute, preHandler: decide }, c.bulkDecide)
    app.get(one, { schema: getApprovalRoute, preHandler: read }, c.get)
    app.post(`${one}/approve`, { schema: approveApprovalRoute, preHandler: decide }, c.approve)
    app.post(`${one}/reject`, { schema: rejectApprovalRoute, preHandler: decide }, c.reject)
    app.post(`${one}/cancel`, { schema: cancelApprovalRoute, preHandler: read }, c.cancel)
    return Promise.resolve()
  }
}
