// SPDX-License-Identifier: AGPL-3.0-only
import type {
  approvalsSummaryRoute,
  approveApprovalRoute,
  bulkDecideRoute,
  cancelApprovalRoute,
  getApprovalRoute,
  listApprovalsRoute,
  rejectApprovalRoute,
} from './approvals.schema.js'
import type { ApprovalsService } from './approvals.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListApprovals = typeof listApprovalsRoute
type ApprovalsSummary = typeof approvalsSummaryRoute
type BulkDecide = typeof bulkDecideRoute
type GetApproval = typeof getApprovalRoute
type ApproveApproval = typeof approveApprovalRoute
type RejectApproval = typeof rejectApprovalRoute
type CancelApproval = typeof cancelApprovalRoute

export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  list = async (request: ZodRequest<ListApprovals>, reply: ZodReply<ListApprovals>) => {
    const { items, nextCursor } = await this.service.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  summary = async (request: ZodRequest<ApprovalsSummary>, reply: ZodReply<ApprovalsSummary>) => {
    reply.ok(await this.service.summary(request.tenant))
  }

  bulkDecide = async (request: ZodRequest<BulkDecide>, reply: ZodReply<BulkDecide>) => {
    reply.ok(await this.service.bulkDecide(request.tenant, request.body))
  }

  get = async (request: ZodRequest<GetApproval>, reply: ZodReply<GetApproval>) => {
    reply.ok(await this.service.get(request.tenant, request.params.approvalId))
  }

  approve = async (request: ZodRequest<ApproveApproval>, reply: ZodReply<ApproveApproval>) => {
    reply.ok(await this.service.approve(request.tenant, request.params.approvalId, request.body))
  }

  reject = async (request: ZodRequest<RejectApproval>, reply: ZodReply<RejectApproval>) => {
    reply.ok(await this.service.reject(request.tenant, request.params.approvalId, request.body))
  }

  cancel = async (request: ZodRequest<CancelApproval>, reply: ZodReply<CancelApproval>) => {
    reply.ok(await this.service.withdraw(request.tenant, request.params.approvalId))
  }
}
