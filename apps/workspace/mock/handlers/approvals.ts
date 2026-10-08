// SPDX-License-Identifier: AGPL-3.0-only
import {
  approvalDetailDtoSchema,
  approvalDtoSchema,
  approvalSummaryDtoSchema,
  approveApprovalInputSchema,
  bulkDecideInputSchema,
  bulkDecideResultDtoSchema,
  ERROR_CODES,
  listApprovalsQuerySchema,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  rejectApprovalInputSchema,
} from '@surefy/contracts'
import type { ApprovalDto } from '@surefy/contracts'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { APPROVALS_NOW, seedApprovals, toDetail, toSummary } from './approvals.fixtures'
import { MAYA, OMAR } from './shell.fixtures'

export {
  BRIDGE_REQUEST_ID,
  CHANNEL_REQUEST_ID,
  DECIDED_ID,
  EXPIRED_ID,
  FINANCE_ONLY_ID,
  OVERDUE_ID,
  PAYMENT_LARGE_ID,
  REFUND_SECOND_ID,
  REFUND_SMALL_ID,
  REJECTED_ID,
  approvalFactory,
} from './approvals.fixtures'

const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE = 422
const DECIDED_STATUSES = ['approved', 'rejected', 'expired', 'canceled']

let approvals = seedApprovals()
/** The fields an approver edited before approving, by approval. */
let edits = new Map<string, Record<string, unknown>>()

/** No approvals at all: the agent editor's tests add the ones a run waits for. */
export function resetApprovalsMock(): void {
  approvals = []
  edits = new Map()
}

/** Back to the seeded queue; the Insights tests call it between cases. */
export function seedApprovalsMock(): void {
  approvals = seedApprovals()
  edits = new Map()
}

/** An approval a run is waiting for. */
export function addApproval(approval: ApprovalDto): void {
  approvals = [...approvals.filter((item) => item.id !== approval.id), approval]
}

export const findApproval = (id: string): ApprovalDto | undefined =>
  approvals.find((item) => item.id === id)

const path = '/orgs/:orgId/approvals'
const find = (id: unknown) => approvals.find((item) => item.id === id)
const replace = (updated: ApprovalDto) => {
  approvals = approvals.map((item) => (item.id === updated.id ? updated : item))
  return updated
}
const notFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.APPROVAL_NOT_FOUND, 'Approval not found')
const notAssigned = () =>
  mockError(
    HTTP_FORBIDDEN,
    ERROR_CODES.APPROVAL_NOT_ASSIGNED,
    'You are not an approver for this item',
  )
const notFresh = () =>
  mockError(HTTP_FORBIDDEN, ERROR_CODES.AUTH_SESSION_NOT_FRESH, 'Sign in again')
const alreadyDecided = (item: ApprovalDto) =>
  item.status === 'expired'
    ? mockError(HTTP_CONFLICT, ERROR_CODES.APPROVAL_EXPIRED, 'This approval timed out')
    : mockError(
        HTTP_CONFLICT,
        ERROR_CODES.APPROVAL_ALREADY_DECIDED,
        `${item.decidedBy?.name ?? 'Someone'} already decided this`,
      )

function decide(
  item: ApprovalDto,
  status: 'approved' | 'rejected',
  extra: Partial<ApprovalDto> = {},
): ApprovalDto {
  return replace({
    ...item,
    status,
    decidedBy: MAYA,
    decidedAt: APPROVALS_NOW,
    resolvedBy: 'user',
    updatedAt: APPROVALS_NOW,
    ...extra,
  })
}

/** A person decides first: the loser of the race sees this on the next request. */
function decideAsOmar(item: ApprovalDto) {
  return replace({
    ...item,
    status: 'approved',
    decidedBy: OMAR,
    decidedAt: APPROVALS_NOW,
    resolvedBy: 'user',
  })
}

/** Without a status the queue is the pending items; "decided today" asks for the decided ones. */
function matchesStatus(
  query: ReturnType<typeof listApprovalsQuerySchema.parse>,
  item: ApprovalDto,
): boolean {
  if (query.status) return query.status.includes(item.status)
  if (query.decidedToday === true) return DECIDED_STATUSES.includes(item.status)
  return item.status === 'pending'
}

function filtered(query: ReturnType<typeof listApprovalsQuerySchema.parse>): ApprovalDto[] {
  const needle = query.q?.toLowerCase()
  const items = approvals.filter(
    (item) =>
      matchesStatus(query, item) &&
      (!query.kind || query.kind.includes(item.kind)) &&
      (!query.risk || query.risk.includes(item.risk)) &&
      (query.canDecide === undefined || item.canDecide === query.canDecide) &&
      (query.quickApprovable === undefined || item.quickApprovable === query.quickApprovable) &&
      (!query.decidedToday || DECIDED_STATUSES.includes(item.status)) &&
      (!query.ruleRef || item.ruleRef === query.ruleRef) &&
      (!query.agentId || item.agent?.id === query.agentId) &&
      (!needle ||
        item.title.toLowerCase().includes(needle) ||
        (item.agent?.name.toLowerCase().includes(needle) ?? false)),
  )
  const decidedView =
    query.decidedToday === true || (query.status?.every((s) => s !== 'pending') ?? false)
  const sort = query.sort ?? (decidedView ? '-decidedAt' : 'createdAt')
  const key = sort.replace(/^-/, '') as 'createdAt' | 'decidedAt' | 'amountMicros'
  const sign = sort.startsWith('-') ? -1 : 1
  return items.toSorted((a, b) => {
    const left = a[key] ?? ''
    const right = b[key] ?? ''
    if (left === right) return 0
    return left > right ? sign : -sign
  })
}

function pageOf(items: ApprovalDto[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit), next)
}

/**
 * Approvals (B6-05's routes; the handlers serve component tests and `MOCK_DOMAINS=approvals`
 * shows the states). Seeded: two small refunds under the quick-approve limit from one rule, a
 * $7,850 payment that needs step-up, a refund assigned to Finance (visible, not decidable), an
 * overdue deal update, a bridge install and a channel publish request, plus an approved, a
 * rejected and an expired item for "Decided today". Scenarios: `empty` on the list is an empty
 * queue; on an approval, `session-not-fresh` asks the person to confirm it's them,
 * `already-decided` lets Omar decide first and `expired` is a timed-out item; on an approve with
 * edited fields, `edit-invalid` fails the amount field.
 */
export const approvalsDomain = defineMockDomain('approvals', [
  defineMockHandler({
    method: 'get',
    path: `${path}/summary`,
    response: okResponse(approvalSummaryDtoSchema),
    scenarios: { default: () => mockOk(toSummary(approvals)) },
  }),
  defineMockHandler({
    method: 'get',
    path,
    response: pageResponse(approvalDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const query = listApprovalsQuerySchema.parse(Object.fromEntries(url.searchParams))
        return pageOf(filtered(query), url)
      },
      empty: () => mockPage([]),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/bulk-decide`,
    response: okResponse(bulkDecideResultDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = bulkDecideInputSchema.parse(await request.json())
        const rules = new Set(input.ids.map((id) => find(id)?.ruleRef ?? null))
        const results = input.ids.map((id) => {
          const item = find(id)
          if (!item)
            return { id, outcome: 'skipped' as const, errorCode: ERROR_CODES.APPROVAL_NOT_FOUND }
          if (item.status !== 'pending') {
            return {
              id,
              outcome: 'skipped' as const,
              errorCode:
                item.status === 'expired'
                  ? ERROR_CODES.APPROVAL_EXPIRED
                  : ERROR_CODES.APPROVAL_ALREADY_DECIDED,
            }
          }
          if (!item.canDecide)
            return { id, outcome: 'skipped' as const, errorCode: ERROR_CODES.APPROVAL_NOT_ASSIGNED }
          if (!item.quickApprovable || rules.size > 1) {
            return {
              id,
              outcome: 'skipped' as const,
              errorCode: ERROR_CODES.APPROVAL_NOT_QUICK_APPROVABLE,
            }
          }
          decide(
            item,
            input.decision === 'approve' ? 'approved' : 'rejected',
            input.decision === 'reject'
              ? { decisionReason: input.reason ?? null, decisionNote: input.note ?? null }
              : {},
          )
          return { id, outcome: 'decided' as const, errorCode: null }
        })
        return mockOk({ results })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/:approvalId`,
    response: okResponse(approvalDetailDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const item = find(params.approvalId)
        return item ? mockOk(toDetail(item, edits.get(item.id) ?? null)) : notFound()
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/:approvalId/approve`,
    response: okResponse(approvalDetailDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const item = find(params.approvalId)
        if (!item) return notFound()
        if (item.status !== 'pending') return alreadyDecided(item)
        if (!item.canDecide) return notAssigned()
        const { editedInput } = approveApprovalInputSchema.parse(await request.json())
        if (editedInput && (item.kind === 'ai_action' || item.kind === 'flow_step')) {
          edits.set(item.id, editedInput)
        }
        const decided = decide(item, 'approved')
        return mockOk(toDetail(decided, edits.get(item.id) ?? null))
      },
      'session-not-fresh': () => notFresh(),
      'already-decided': ({ params }) => {
        const item = find(params.approvalId)
        return item ? alreadyDecided(decideAsOmar(item)) : notFound()
      },
      expired: ({ params }) => {
        const item = find(params.approvalId)
        return item
          ? alreadyDecided(
              replace({
                ...item,
                status: 'expired',
                resolvedBy: 'timeout',
                decidedAt: APPROVALS_NOW,
              }),
            )
          : notFound()
      },
      'edit-invalid': () =>
        mockError(HTTP_UNPROCESSABLE, ERROR_CODES.VALIDATION_FAILED, 'Check the fields', {
          details: [{ path: 'amount', code: 'invalid', message: 'Enter an amount above 0' }],
        }),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/:approvalId/reject`,
    response: okResponse(approvalDetailDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const item = find(params.approvalId)
        if (!item) return notFound()
        if (item.status !== 'pending') return alreadyDecided(item)
        if (!item.canDecide) return notAssigned()
        const input = rejectApprovalInputSchema.parse(await request.json())
        const decided = decide(item, 'rejected', {
          decisionReason: input.reason,
          decisionNote: input.note ?? null,
        })
        return mockOk(toDetail(decided, null))
      },
      'already-decided': ({ params }) => {
        const item = find(params.approvalId)
        return item ? alreadyDecided(decideAsOmar(item)) : notFound()
      },
    },
  }),
])
