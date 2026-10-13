// SPDX-License-Identifier: AGPL-3.0-only
import type {
  CreateGuardrailInput,
  CreatePiiRuleInput,
  DataFiltersDto,
  GuardImpactPreviewDto,
  GuardOverviewDto,
  GuardOverviewRange,
  GuardRuleRowDto,
  GuardSettingsDto,
  GuardrailDto,
  GuardrailImpactDto,
  LockGuardrailInput,
  PiiRuleDto,
  TestDataFilterInput,
  TestDataFilterResultDto,
  UpdateGuardSettingsInput,
  UpdateGuardrailInput,
  UpdatePiiRuleInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { GuardRuleListFilters } from './guard.queries'

/** Guard: the organization's defaults, rules and data filters, as the screens read and write them. */
export const guardApi = {
  overview: (http: HttpClient, orgId: string, range: GuardOverviewRange, signal?: AbortSignal) =>
    http.get<GuardOverviewDto>(`/orgs/${orgId}/guard/overview`, { params: { range }, signal }),
  defaults: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<GuardSettingsDto>(`/orgs/${orgId}/guard/defaults`, { signal }),
  /** Saving is T2; loosening needs a `reason`. */
  updateDefaults: (http: HttpClient, orgId: string, input: UpdateGuardSettingsInput) =>
    http.put<GuardSettingsDto>(`/orgs/${orgId}/guard/defaults`, input),
  /** The proposed thresholds, banded over the last 1,000 checked actions. */
  defaultsImpact: (
    http: HttpClient,
    orgId: string,
    thresholds: { autoThresholdBp: number; reviewThresholdBp: number },
    signal?: AbortSignal,
  ) =>
    http.get<GuardImpactPreviewDto>(`/orgs/${orgId}/guard/defaults/impact`, {
      params: thresholds,
      signal,
    }),
  rules: (http: HttpClient, orgId: string, query: GuardRuleListFilters, signal?: AbortSignal) =>
    http.getPage<GuardRuleRowDto>(`/orgs/${orgId}/guard/guardrails`, {
      params: { ...query },
      signal,
    }),
  guardrail: (http: HttpClient, orgId: string, guardrailId: string, signal?: AbortSignal) =>
    http.get<GuardrailDto>(`/orgs/${orgId}/guard/guardrails/${guardrailId}`, { signal }),
  createGuardrail: (http: HttpClient, orgId: string, input: CreateGuardrailInput) =>
    http.post<GuardrailDto>(`/orgs/${orgId}/guard/guardrails`, input),
  updateGuardrail: (
    http: HttpClient,
    orgId: string,
    guardrailId: string,
    input: UpdateGuardrailInput,
  ) => http.patch<GuardrailDto>(`/orgs/${orgId}/guard/guardrails/${guardrailId}`, input),
  deleteGuardrail: (http: HttpClient, orgId: string, guardrailId: string, reason?: string) =>
    http.delete(`/orgs/${orgId}/guard/guardrails/${guardrailId}`, { params: { reason } }),
  guardrailImpact: (http: HttpClient, orgId: string, guardrailId: string, signal?: AbortSignal) =>
    http.get<GuardrailImpactDto>(`/orgs/${orgId}/guard/guardrails/${guardrailId}/impact`, {
      signal,
    }),
  lockGuardrail: (
    http: HttpClient,
    orgId: string,
    guardrailId: string,
    input: LockGuardrailInput,
  ) => http.post<GuardrailDto>(`/orgs/${orgId}/guard/guardrails/${guardrailId}/lock`, input),
  unlockGuardrail: (http: HttpClient, orgId: string, guardrailId: string) =>
    http.post<GuardrailDto>(`/orgs/${orgId}/guard/guardrails/${guardrailId}/unlock`),
  dataFilters: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<DataFiltersDto>(`/orgs/${orgId}/guard/data-filters`, { signal }),
  /** "Try it": the organization's rules (or a team's or agent's) applied to a sample text. */
  testDataFilter: (http: HttpClient, orgId: string, input: TestDataFilterInput) =>
    http.post<TestDataFilterResultDto>(`/orgs/${orgId}/guard/data-filters/test`, input),
  createPiiRule: (http: HttpClient, orgId: string, input: CreatePiiRuleInput) =>
    http.post<PiiRuleDto>(`/orgs/${orgId}/guard/pii-rules`, input),
  updatePiiRule: (http: HttpClient, orgId: string, ruleId: string, input: UpdatePiiRuleInput) =>
    http.patch<PiiRuleDto>(`/orgs/${orgId}/guard/pii-rules/${ruleId}`, input),
  deletePiiRule: (http: HttpClient, orgId: string, ruleId: string, reason?: string) =>
    http.delete(`/orgs/${orgId}/guard/pii-rules/${ruleId}`, { params: { reason } }),
}
