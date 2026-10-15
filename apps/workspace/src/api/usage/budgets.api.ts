// SPDX-License-Identifier: AGPL-3.0-only
import type {
  BudgetDto,
  BudgetScope,
  CreateBudgetInput,
  UpdateBudgetInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/** One scope at a time: the page lists the organization, teams and people separately. */
export interface BudgetListFilters {
  scope: BudgetScope
  /** Matches the team name, the person's name and email. */
  q?: string
  limit?: number
  cursor?: string
}

/** AI cost budgets (Settings › Usage & budgets, the single home of budgets). */
export const budgetsApi = {
  list: (http: HttpClient, orgId: string, query: BudgetListFilters, signal?: AbortSignal) =>
    http.getPage<BudgetDto>(`/orgs/${orgId}/budgets`, { params: { ...query }, signal }),
  create: (http: HttpClient, orgId: string, input: CreateBudgetInput) =>
    http.post<BudgetDto>(`/orgs/${orgId}/budgets`, input),
  update: (http: HttpClient, orgId: string, budgetId: string, input: UpdateBudgetInput) =>
    http.patch<BudgetDto>(`/orgs/${orgId}/budgets/${budgetId}`, input),
  remove: (http: HttpClient, orgId: string, budgetId: string) =>
    http.delete(`/orgs/${orgId}/budgets/${budgetId}`),
}
