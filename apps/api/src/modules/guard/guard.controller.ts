// SPDX-License-Identifier: AGPL-3.0-only
import type { GuardrailsService } from './guard.guardrails.service.js'
import type { PiiRulesService } from './guard.piiRules.service.js'
import type {
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
import type { GuardSettingsService } from './guard.settings.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'
import type { FastifySchema } from 'fastify'

type R<Route extends FastifySchema> = ZodRequest<Route>
type P<Route extends FastifySchema> = ZodReply<Route>

export class GuardController {
  constructor(
    private readonly settings: GuardSettingsService,
    private readonly guardrails: GuardrailsService,
    private readonly piiRules: PiiRulesService,
  ) {}

  overview = async (request: R<typeof overviewRoute>, reply: P<typeof overviewRoute>) => {
    reply.ok(await this.settings.overview(request.tenant, request.query))
  }

  getDefaults = async (request: R<typeof getDefaultsRoute>, reply: P<typeof getDefaultsRoute>) => {
    reply.ok(await this.settings.getDefaults(request.tenant))
  }

  updateDefaults = async (
    request: R<typeof updateDefaultsRoute>,
    reply: P<typeof updateDefaultsRoute>,
  ) => {
    reply.ok(await this.settings.updateDefaults(request.tenant, request.body))
  }

  defaultsImpact = async (
    request: R<typeof defaultsImpactRoute>,
    reply: P<typeof defaultsImpactRoute>,
  ) => {
    reply.ok(await this.settings.impact(request.tenant, request.query))
  }

  listGuardrails = async (
    request: R<typeof listGuardrailsRoute>,
    reply: P<typeof listGuardrailsRoute>,
  ) => {
    const { items, nextCursor } = await this.guardrails.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  createGuardrail = async (
    request: R<typeof createGuardrailRoute>,
    reply: P<typeof createGuardrailRoute>,
  ) => {
    reply.created(await this.guardrails.create(request.tenant, request.body))
  }

  getGuardrail = async (
    request: R<typeof getGuardrailRoute>,
    reply: P<typeof getGuardrailRoute>,
  ) => {
    reply.ok(await this.guardrails.get(request.tenant, request.params.guardrailId))
  }

  updateGuardrail = async (
    request: R<typeof updateGuardrailRoute>,
    reply: P<typeof updateGuardrailRoute>,
  ) => {
    reply.ok(await this.guardrails.update(request.tenant, request.params.guardrailId, request.body))
  }

  deleteGuardrail = async (
    request: R<typeof deleteGuardrailRoute>,
    reply: P<typeof deleteGuardrailRoute>,
  ) => {
    await this.guardrails.delete(request.tenant, request.params.guardrailId, request.query.reason)
    reply.noContent()
  }

  guardrailImpact = async (
    request: R<typeof guardrailImpactRoute>,
    reply: P<typeof guardrailImpactRoute>,
  ) => {
    reply.ok(await this.guardrails.impact(request.tenant, request.params.guardrailId))
  }

  lockGuardrail = async (
    request: R<typeof lockGuardrailRoute>,
    reply: P<typeof lockGuardrailRoute>,
  ) => {
    reply.ok(await this.guardrails.lock(request.tenant, request.params.guardrailId, request.body))
  }

  unlockGuardrail = async (
    request: R<typeof unlockGuardrailRoute>,
    reply: P<typeof unlockGuardrailRoute>,
  ) => {
    reply.ok(await this.guardrails.unlock(request.tenant, request.params.guardrailId))
  }

  dataFilters = async (request: R<typeof dataFiltersRoute>, reply: P<typeof dataFiltersRoute>) => {
    reply.ok(await this.piiRules.list(request.tenant))
  }

  testDataFilter = async (
    request: R<typeof testDataFilterRoute>,
    reply: P<typeof testDataFilterRoute>,
  ) => {
    reply.ok(await this.piiRules.test(request.tenant, request.body))
  }

  createPiiRule = async (
    request: R<typeof createPiiRuleRoute>,
    reply: P<typeof createPiiRuleRoute>,
  ) => {
    reply.created(await this.piiRules.create(request.tenant, request.body))
  }

  updatePiiRule = async (
    request: R<typeof updatePiiRuleRoute>,
    reply: P<typeof updatePiiRuleRoute>,
  ) => {
    reply.ok(await this.piiRules.update(request.tenant, request.params.ruleId, request.body))
  }

  deletePiiRule = async (
    request: R<typeof deletePiiRuleRoute>,
    reply: P<typeof deletePiiRuleRoute>,
  ) => {
    await this.piiRules.delete(request.tenant, request.params.ruleId, request.query.reason)
    reply.noContent()
  }
}
