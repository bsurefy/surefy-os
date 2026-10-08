// SPDX-License-Identifier: AGPL-3.0-only
import type { GuardRuleRowDto, GuardSettingsDto } from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { GuardRuleListFilters } from './guard.queries'

/** Guard: the organization's defaults and its rules, as the screens read them. */
export const guardApi = {
  defaults: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<GuardSettingsDto>(`/orgs/${orgId}/guard/defaults`, { signal }),
  rules: (http: HttpClient, orgId: string, query: GuardRuleListFilters, signal?: AbortSignal) =>
    http.getPage<GuardRuleRowDto>(`/orgs/${orgId}/guard/guardrails`, {
      params: { ...query },
      signal,
    }),
}
