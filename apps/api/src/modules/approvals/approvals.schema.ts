// SPDX-License-Identifier: AGPL-3.0-only
import {
  approvalDetailDtoSchema,
  approvalDtoSchema,
  approvalParamsSchema,
  approvalSummaryDtoSchema,
  approveApprovalInputSchema,
  bulkDecideInputSchema,
  bulkDecideResultDtoSchema,
  listApprovalsQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  rejectApprovalInputSchema,
} from '@surefy/contracts'

const TAGS = ['approvals']

export const listApprovalsRoute = {
  tags: TAGS,
  summary: 'The approval queue (pending, oldest first) or the decided ones',
  params: orgParamsSchema,
  querystring: listApprovalsQuerySchema,
  response: { 200: pageResponse(approvalDtoSchema) },
}

export const approvalsSummaryRoute = {
  tags: TAGS,
  summary: 'Counts for the top-bar badge and the queue header',
  params: orgParamsSchema,
  response: { 200: okResponse(approvalSummaryDtoSchema) },
}

export const bulkDecideRoute = {
  tags: TAGS,
  summary: 'Approve or reject items of one rule that fit the quick-approve limits',
  params: orgParamsSchema,
  body: bulkDecideInputSchema,
  response: { 200: okResponse(bulkDecideResultDtoSchema) },
}

export const getApprovalRoute = {
  tags: TAGS,
  summary: 'What will happen, why the AI suggests it, and who may decide',
  params: approvalParamsSchema,
  response: { 200: okResponse(approvalDetailDtoSchema) },
}

export const approveApprovalRoute = {
  tags: TAGS,
  summary: 'Approve, or edit and approve; above the step-up amount a fresh sign-in is required',
  params: approvalParamsSchema,
  body: approveApprovalInputSchema,
  response: { 200: okResponse(approvalDetailDtoSchema) },
}

export const rejectApprovalRoute = {
  tags: TAGS,
  summary: 'Reject with a reason',
  params: approvalParamsSchema,
  body: rejectApprovalInputSchema,
  response: { 200: okResponse(approvalDetailDtoSchema) },
}

export const cancelApprovalRoute = {
  tags: TAGS,
  summary: 'The requester withdraws their pending request',
  params: approvalParamsSchema,
  response: { 200: okResponse(approvalDetailDtoSchema) },
}
