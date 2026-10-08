// SPDX-License-Identifier: AGPL-3.0-only
import {
  createGuardrailInputSchema,
  createPiiRuleInputSchema,
  dataFiltersDtoSchema,
  deleteGuardrailQuerySchema,
  deletePiiRuleQuerySchema,
  guardImpactPreviewDtoSchema,
  guardImpactPreviewQuerySchema,
  guardOverviewDtoSchema,
  guardOverviewQuerySchema,
  guardParamsSchema,
  guardrailDtoSchema,
  guardrailImpactDtoSchema,
  guardrailParamsSchema,
  guardRuleRowDtoSchema,
  guardSettingsDtoSchema,
  listGuardrailsQuerySchema,
  lockGuardrailInputSchema,
  okResponse,
  pageResponse,
  piiRuleDtoSchema,
  piiRuleParamsSchema,
  testDataFilterInputSchema,
  testDataFilterResultDtoSchema,
  updateGuardrailInputSchema,
  updateGuardSettingsInputSchema,
  updatePiiRuleInputSchema,
} from '@surefy/contracts'

const TAGS = ['guard']

export const overviewRoute = {
  tags: TAGS,
  summary: 'How actions were checked in the range, what Guard stopped and what needs attention',
  params: guardParamsSchema,
  querystring: guardOverviewQuerySchema,
  response: { 200: okResponse(guardOverviewDtoSchema) },
}

export const getDefaultsRoute = {
  tags: TAGS,
  summary: "The organization's Guard defaults (thresholds and approval settings)",
  params: guardParamsSchema,
  response: { 200: okResponse(guardSettingsDtoSchema) },
}

export const updateDefaultsRoute = {
  tags: TAGS,
  summary: 'Save the Guard defaults; loosening anything needs a reason',
  params: guardParamsSchema,
  body: updateGuardSettingsInputSchema,
  response: { 200: okResponse(guardSettingsDtoSchema) },
}

export const defaultsImpactRoute = {
  tags: TAGS,
  summary: 'How many of the last 1,000 checked actions each band would take with these thresholds',
  params: guardParamsSchema,
  querystring: guardImpactPreviewQuerySchema,
  response: { 200: okResponse(guardImpactPreviewDtoSchema) },
}

export const listGuardrailsRoute = {
  tags: TAGS,
  summary: 'The Guardrails table: stored rules, data filters and agent and flow rules (read-only)',
  params: guardParamsSchema,
  querystring: listGuardrailsQuerySchema,
  response: { 200: pageResponse(guardRuleRowDtoSchema) },
}

export const createGuardrailRoute = {
  tags: TAGS,
  summary: 'Add a guardrail',
  params: guardParamsSchema,
  body: createGuardrailInputSchema,
  response: { 201: okResponse(guardrailDtoSchema) },
}

export const getGuardrailRoute = {
  tags: TAGS,
  summary: 'Get a guardrail with the rule it conflicts with, if any',
  params: guardrailParamsSchema,
  response: { 200: okResponse(guardrailDtoSchema) },
}

export const updateGuardrailRoute = {
  tags: TAGS,
  summary: 'Change a guardrail; turning it off or loosening it needs a reason',
  params: guardrailParamsSchema,
  body: updateGuardrailInputSchema,
  response: { 200: okResponse(guardrailDtoSchema) },
}

export const deleteGuardrailRoute = {
  tags: TAGS,
  summary: 'Delete a guardrail; a rule that is on needs a reason',
  params: guardrailParamsSchema,
  querystring: deleteGuardrailQuerySchema,
}

export const guardrailImpactRoute = {
  tags: TAGS,
  summary: 'The agents and flows a guardrail applies to',
  params: guardrailParamsSchema,
  response: { 200: okResponse(guardrailImpactDtoSchema) },
}

export const lockGuardrailRoute = {
  tags: TAGS,
  summary: 'Lock a guardrail so only Owners change it',
  params: guardrailParamsSchema,
  body: lockGuardrailInputSchema,
  response: { 200: okResponse(guardrailDtoSchema) },
}

export const unlockGuardrailRoute = {
  tags: TAGS,
  summary: 'Unlock a guardrail',
  params: guardrailParamsSchema,
  response: { 200: okResponse(guardrailDtoSchema) },
}

export const dataFiltersRoute = {
  tags: TAGS,
  summary: 'The personal-data types with their action and exceptions',
  params: guardParamsSchema,
  response: { 200: okResponse(dataFiltersDtoSchema) },
}

export const testDataFilterRoute = {
  tags: TAGS,
  summary: 'Try the data filter on a text',
  params: guardParamsSchema,
  body: testDataFilterInputSchema,
  response: { 200: okResponse(testDataFilterResultDtoSchema) },
}

export const createPiiRuleRoute = {
  tags: TAGS,
  summary: "Set a type's action for the organization, or add a team or agent exception",
  params: guardParamsSchema,
  body: createPiiRuleInputSchema,
  response: { 201: okResponse(piiRuleDtoSchema) },
}

export const updatePiiRuleRoute = {
  tags: TAGS,
  summary: "Change the action, or a custom type's label and pattern",
  params: piiRuleParamsSchema,
  body: updatePiiRuleInputSchema,
  response: { 200: okResponse(piiRuleDtoSchema) },
}

export const deletePiiRuleRoute = {
  tags: TAGS,
  summary: 'Remove a rule; the next level applies',
  params: piiRuleParamsSchema,
  querystring: deletePiiRuleQuerySchema,
}
