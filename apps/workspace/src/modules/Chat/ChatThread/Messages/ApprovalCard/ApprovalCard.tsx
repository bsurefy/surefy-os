// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleSlash, CircleX, Clock } from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { approvalQueries } from '@/api/approvals'
import { chatKeys } from '@/api/chats'
import { useApprovalLabels } from '@/modules/Insights'
import type { ApprovalDto, ApprovalStatus } from '@surefy/contracts'
import { cn } from '@surefy/ui/lib/utils'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { APPROVAL_REFRESH_MS } from '../../ChatThread.constants'

import type { ThreadNote } from '../../ChatThread.types'

type ApprovalNote = Extract<ThreadNote, { name: 'approval' }>

const ICONS = {
  pending: Clock,
  approved: CircleCheck,
  rejected: CircleX,
  expired: CircleSlash,
  canceled: CircleSlash,
} satisfies Record<ApprovalStatus, typeof Clock>

type ApprovalTranslator = ReturnType<typeof useTranslations<'chat.thread.approval'>>

/** What the card says about the approval's state, with who decides or how it ended. */
function summaryOf(
  status: ApprovalStatus,
  approval: ApprovalDto | undefined,
  assignees: string,
  t: ApprovalTranslator,
  labels: ReturnType<typeof useApprovalLabels>,
): string {
  switch (status) {
    case 'pending':
      return assignees ? t('waitingFor', { assignees }) : t('waiting')
    case 'approved':
      return approval?.decidedBy
        ? t('approvedBy', { name: approval.decidedBy.name })
        : t('approved')
    case 'rejected': {
      const reason =
        approval?.decisionNote ??
        (approval?.decisionReason ? labels.reason(approval.decisionReason) : null)
      return reason ? t('rejectedWith', { reason }) : t('rejected')
    }
    case 'expired':
      return approval?.timeoutAction
        ? t('timedOutWith', { action: t(`timeoutActions.${approval.timeoutAction}`) })
        : t('timedOut')
    default:
      return t('canceled')
  }
}

/**
 * An agent action waiting for approval in an agent chat (chat.md §4): "Waiting for approval by
 * Finance" with when it expires, updated live; then Approved, Rejected with the reason, or Timed
 * out with what the timeout did. A decision lets the run go on, so the thread reloads its answer.
 */
export default function ApprovalCard({ note }: Readonly<{ note: ApprovalNote }>) {
  const t = useTranslations('chat.thread.approval')
  const labels = useApprovalLabels()
  const format = useFormatter()
  const now = useNow({ updateInterval: APPROVAL_REFRESH_MS })
  const orgId = useCurrentOrgId()
  const queryClient = useQueryClient()
  const { data: approval } = useQuery({
    ...approvalQueries.detail(orgId, note.approvalId),
    retry: false,
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== 'pending' ? false : APPROVAL_REFRESH_MS,
  })
  const status = approval?.status ?? 'pending'

  const lastStatus = useRef(status)
  useEffect(() => {
    if (lastStatus.current === 'pending' && status !== 'pending') {
      void queryClient.invalidateQueries({ queryKey: [...chatKeys.all(orgId), 'messages'] })
    }
    lastStatus.current = status
  }, [status, orgId, queryClient])

  const title = approval?.title ?? note.title
  const assignees = labels.assignees({ assignees: approval?.assignees ?? note.assignees ?? [] })
  const expiresAt = approval?.expiresAt ?? note.expiresAt ?? null
  const Icon = ICONS[status]

  const summary = summaryOf(status, approval, assignees, t, labels)

  return (
    <div
      role="status"
      className={cn(
        'border-border bg-surface flex items-start gap-3 rounded-xl border px-4 py-3',
        status === 'pending' && 'border-warning/40 bg-warning-soft',
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          status === 'approved' && 'text-success',
          status === 'rejected' && 'text-destructive',
          (status === 'pending' || status === 'expired' || status === 'canceled') &&
            'text-muted-foreground',
        )}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        {title && <p className="text-label font-semibold">{title}</p>}
        <p className="text-body">{summary}</p>
        {status === 'pending' && expiresAt && (
          <p className="text-caption text-muted-foreground">
            {t('expires', { when: format.relativeTime(new Date(expiresAt), now) })}
          </p>
        )}
      </div>
    </div>
  )
}
