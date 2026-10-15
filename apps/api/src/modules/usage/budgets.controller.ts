// SPDX-License-Identifier: AGPL-3.0-only
import type {
  createBudgetRoute,
  deleteBudgetRoute,
  listBudgetsRoute,
  updateBudgetRoute,
} from './budgets.schema.js'
import type { BudgetsService } from './budgets.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListBudgets = typeof listBudgetsRoute
type CreateBudget = typeof createBudgetRoute
type UpdateBudget = typeof updateBudgetRoute
type DeleteBudget = typeof deleteBudgetRoute

export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  list = async (request: ZodRequest<ListBudgets>, reply: ZodReply<ListBudgets>) => {
    const { items, nextCursor } = await this.budgets.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  create = async (request: ZodRequest<CreateBudget>, reply: ZodReply<CreateBudget>) => {
    reply.created(await this.budgets.create(request.tenant, request.body))
  }

  update = async (request: ZodRequest<UpdateBudget>, reply: ZodReply<UpdateBudget>) => {
    reply.ok(await this.budgets.update(request.tenant, request.params.budgetId, request.body))
  }

  delete = async (request: ZodRequest<DeleteBudget>, reply: ZodReply<DeleteBudget>) => {
    await this.budgets.delete(request.tenant, request.params.budgetId)
    reply.noContent()
  }
}
