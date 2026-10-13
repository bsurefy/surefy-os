// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { approvalQueries, useApproveApprovalMutation } from '@/api/approvals'
import { ERROR_CODES, PERMISSIONS } from '@surefy/contracts'
import type { ApprovalDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan, useCurrentOrgId, useHasModule } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { APPROVALS_POPOVER_LIMIT, APPROVALS_REFRESH_MS } from '../Workspace.constants'

/**
 * The top-bar approvals button: the count of items this person can decide (refreshed every
 * minute) and, once opened, the oldest five. Approve is inline only for items inside the
 * quick-approve limit and is a deferred commit: the decision is sent when the Undo toast closes.
 */
export function useApprovalsPopoverController() {
  const t = useTranslations('workspace.approvals')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const canRead = useCan(PERMISSIONS.APPROVALS_READ)
  const hasGuard = useHasModule('guard')
  const isAvailable = canRead && hasGuard
  const [isOpen, setIsOpen] = useState(false)
  /** Items whose Undo toast is still open: hidden from the list so they cannot be approved twice. */
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const { data: summary } = useQuery({
    ...approvalQueries.summary(orgId),
    enabled: isAvailable,
    refetchInterval: APPROVALS_REFRESH_MS,
  })
  const oldest = useInfiniteQuery({
    ...approvalQueries.list(orgId, {
      status: 'pending',
      canDecide: true,
      sort: 'createdAt',
      limit: APPROVALS_POPOVER_LIMIT,
    }),
    enabled: isAvailable && isOpen,
  })
  const approve = useApproveApprovalMutation(orgId, { silent: true })

  const release = (id: string) => {
    setPendingIds((ids) => ids.filter((pending) => pending !== id))
  }

  const onApprove = (item: ApprovalDto) => {
    setPendingIds((ids) => [...ids, item.id])
    toast.undo(t('approving', { title: item.title }), {
      undoLabel: t('undo'),
      onUndo: () => {
        release(item.id)
      },
      onCommit: () => {
        approve
          .mutateAsync({ approvalId: item.id, via: 'popover' })
          .then(() => {
            toast.success(t('approved', { title: item.title }))
          })
          .catch((error: unknown) => {
            release(item.id)
            // the confirmation dialog is the one message for this failure
            if (isApiError(error) && error.code === ERROR_CODES.AUTH_SESSION_NOT_FRESH) return
            toast.error(getErrorMessage(error, tErrors))
          })
      },
    })
  }

  return {
    isAvailable,
    isOpen,
    setIsOpen,
    count: summary?.pendingForMe ?? 0,
    items: (oldest.data?.pages[0]?.items ?? []).filter((item) => !pendingIds.includes(item.id)),
    isLoading: oldest.isPending,
    isError: oldest.isError,
    refetch: () => void oldest.refetch(),
    onApprove,
    onClose: () => {
      setIsOpen(false)
    },
    t,
  }
}
