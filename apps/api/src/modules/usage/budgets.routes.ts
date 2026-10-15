// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  createBudgetRoute,
  deleteBudgetRoute,
  listBudgetsRoute,
  updateBudgetRoute,
} from './budgets.schema.js'

import type { BudgetsController } from './budgets.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function budgetsRoutes(controller: BudgetsController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.BUDGETS_READ)
    const manage = app.authorize(PERMISSIONS.BUDGETS_MANAGE)
    app.get('/orgs/:orgId/budgets', { schema: listBudgetsRoute, preHandler: read }, controller.list)
    app.post(
      '/orgs/:orgId/budgets',
      { schema: createBudgetRoute, preHandler: manage },
      controller.create,
    )
    app.patch(
      '/orgs/:orgId/budgets/:budgetId',
      { schema: updateBudgetRoute, preHandler: manage },
      controller.update,
    )
    app.delete(
      '/orgs/:orgId/budgets/:budgetId',
      { schema: deleteBudgetRoute, preHandler: manage },
      controller.delete,
    )
    return Promise.resolve()
  }
}
