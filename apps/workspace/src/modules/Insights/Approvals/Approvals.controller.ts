// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { approvalQueries, useBulkDecideApprovalsMutation } from '@/api/approvals'
import type { ApprovalDecisionReason } from '@surefy/contracts'
import type { DataTableSelection } from '@surefy/ui/components/DataDisplay'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { QUEUE_REFRESH_MS, SEARCH_DEBOUNCE_MS } from './Approvals.constants'
import { approvalsSearchParams } from './Approvals.searchParams'
import { getBulkSelection, hasActiveFilters, toListQuery } from './Approvals.utils'

import type { ApprovalsFilterChange } from './Approvals.types'
import type { RejectValues } from './RejectDialog'

/**
 * Insights › Approvals: the view, search and filters in the URL, the queue (refreshed while open),
 * and the bulk decisions. Bulk approve is a deferred commit: it is sent when the Undo toast closes.
 */
export function useApprovalsController() {
  const t = useTranslations('insights.approvals')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [filters, setFilters] = useQueryStates(approvalsSearchParams)
  const [selection, setSelection] = useState<DataTableSelection>({})
  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectError, setRejectError] = useState<string>()

  const list = useInfiniteQuery({
    ...approvalQueries.list(orgId, toListQuery(filters)),
    refetchInterval: QUEUE_REFRESH_MS,
  })
  const summary = useQuery({ ...approvalQueries.summary(orgId), refetchInterval: QUEUE_REFRESH_MS })
  const bulkDecide = useBulkDecideApprovalsMutation(orgId, { silent: true })

  const rows = list.data?.pages.flatMap((page) => page.items) ?? []
  const bulk = getBulkSelection(rows, selection)
  const selectedCount = Object.keys(selection).length

  const showResult = (results: { outcome: 'decided' | 'skipped' }[]) => {
    const decided = results.filter((result) => result.outcome === 'decided').length
    const skipped = results.length - decided
    const message = t('bulk.result', { decided, skipped })
    if (skipped > 0) toast.warning(message)
    else toast.success(message)
  }
  const send = (input: Parameters<typeof bulkDecide.mutateAsync>[0]) =>
    bulkDecide.mutateAsync(input).then(({ results }) => {
      showResult(results)
    })

  const changeFilters = (next: ApprovalsFilterChange) => {
    setSelection({})
    void setFilters(next)
  }

  return {
    orgId,
    orgSlug,
    filters,
    rows,
    counts: {
      pending: summary.data?.pending,
      decided: summary.data?.decidedToday,
    },
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    hasFilters: hasActiveFilters(filters),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFiltersChange: changeFilters,
    onClearFilters: () => {
      changeFilters({ q: null, kind: null, risk: null })
    },
    selection,
    onSelectionChange: setSelection,
    selectedCount,
    bulk,
    onClearSelection: () => {
      setSelection({})
    },
    onBulkApprove: () => {
      const ids = bulk.ids
      const previous = selection
      setSelection({})
      toast.undo(t('bulk.approving', { count: ids.length }), {
        undoLabel: t('bulk.undo'),
        onUndo: () => {
          setSelection(previous)
        },
        onCommit: () => {
          send({ ids, decision: 'approve' }).catch((error: unknown) => {
            toast.error(getErrorMessage(error, tErrors))
          })
        },
      })
    },
    isRejecting,
    onRejectOpenChange: (open: boolean) => {
      setIsRejecting(open)
      if (!open) setRejectError(undefined)
    },
    rejectError,
    onBulkReject: async ({ reason, note }: RejectValues) => {
      const input = {
        ids: bulk.ids,
        decision: 'reject' as const,
        reason: reason satisfies ApprovalDecisionReason,
        note,
      }
      try {
        await send(input)
        setSelection({})
      } catch (error) {
        setRejectError(getErrorMessage(error, tErrors))
        throw error
      }
    },
    t,
  }
}
