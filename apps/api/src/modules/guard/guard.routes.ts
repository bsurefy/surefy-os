// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  createGuardrailRoute,
  createPiiRuleRoute,
  dataFiltersRoute,
  defaultsImpactRoute,
  deleteGuardrailRoute,
  deletePiiRuleRoute,
  getDefaultsRoute,
  getGuardrailRoute,
  guardrailImpactRoute,
  listGuardrailsRoute,
  lockGuardrailRoute,
  overviewRoute,
  testDataFilterRoute,
  unlockGuardrailRoute,
  updateDefaultsRoute,
  updateGuardrailRoute,
  updatePiiRuleRoute,
} from './guard.schema.js'

import type { GuardController } from './guard.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * Guard routes (guard.md). Reading needs `guard:read` (Builders and up; Builders see the rules
 * that apply to their teams), changing needs `guard:manage` (Admins and Owners), and locking
 * needs `guard:lock` (Owners). A locked guardrail changes only through Owners: the service checks
 * it (`GUARD_RULE_LOCKED`).
 */
export function guardRoutes(c: GuardController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.GUARD_READ)
    const manage = app.authorize(PERMISSIONS.GUARD_MANAGE)
    const lock = app.authorize(PERMISSIONS.GUARD_LOCK)
    const base = '/orgs/:orgId/guard'
    const rule = `${base}/guardrails/:guardrailId`
    const pii = `${base}/pii-rules/:ruleId`

    app.get(`${base}/overview`, { schema: overviewRoute, preHandler: read }, c.overview)
    app.get(`${base}/defaults`, { schema: getDefaultsRoute, preHandler: read }, c.getDefaults)
    app.put(
      `${base}/defaults`,
      { schema: updateDefaultsRoute, preHandler: manage },
      c.updateDefaults,
    )
    app.get(
      `${base}/defaults/impact`,
      { schema: defaultsImpactRoute, preHandler: read },
      c.defaultsImpact,
    )

    app.get(
      `${base}/guardrails`,
      { schema: listGuardrailsRoute, preHandler: read },
      c.listGuardrails,
    )
    app.post(
      `${base}/guardrails`,
      { schema: createGuardrailRoute, preHandler: manage },
      c.createGuardrail,
    )
    app.get(rule, { schema: getGuardrailRoute, preHandler: read }, c.getGuardrail)
    app.patch(rule, { schema: updateGuardrailRoute, preHandler: manage }, c.updateGuardrail)
    app.delete(rule, { schema: deleteGuardrailRoute, preHandler: manage }, c.deleteGuardrail)
    app.get(`${rule}/impact`, { schema: guardrailImpactRoute, preHandler: read }, c.guardrailImpact)
    app.post(`${rule}/lock`, { schema: lockGuardrailRoute, preHandler: lock }, c.lockGuardrail)
    app.post(
      `${rule}/unlock`,
      { schema: unlockGuardrailRoute, preHandler: lock },
      c.unlockGuardrail,
    )

    app.get(`${base}/data-filters`, { schema: dataFiltersRoute, preHandler: read }, c.dataFilters)
    app.post(
      `${base}/data-filters/test`,
      { schema: testDataFilterRoute, preHandler: manage },
      c.testDataFilter,
    )
    app.post(
      `${base}/pii-rules`,
      { schema: createPiiRuleRoute, preHandler: manage },
      c.createPiiRule,
    )
    app.patch(pii, { schema: updatePiiRuleRoute, preHandler: manage }, c.updatePiiRule)
    app.delete(pii, { schema: deletePiiRuleRoute, preHandler: manage }, c.deletePiiRule)
    return Promise.resolve()
  }
}
