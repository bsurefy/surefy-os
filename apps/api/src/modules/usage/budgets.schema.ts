// SPDX-License-Identifier: AGPL-3.0-only
import {
  budgetDtoSchema,
  budgetParamsSchema,
  createBudgetInputSchema,
  listBudgetsQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  updateBudgetInputSchema,
} from '@surefy/contracts'

const TAGS = ['budgets']

export const listBudgetsRoute = {
  tags: TAGS,
  summary: "List the organization's budgets with this month's spend",
  params: orgParamsSchema,
  querystring: listBudgetsQuerySchema,
  response: { 200: pageResponse(budgetDtoSchema) },
}

export const createBudgetRoute = {
  tags: TAGS,
  summary: 'Create the budget of the organization, a team or one person',
  params: orgParamsSchema,
  body: createBudgetInputSchema,
  response: { 201: okResponse(budgetDtoSchema) },
}

export const updateBudgetRoute = {
  tags: TAGS,
  summary: 'Change the amount, what happens when reached, the alerts or whether it applies',
  params: budgetParamsSchema,
  body: updateBudgetInputSchema,
  response: { 200: okResponse(budgetDtoSchema) },
}

export const deleteBudgetRoute = {
  tags: TAGS,
  summary: 'Delete a budget',
  params: budgetParamsSchema,
}
