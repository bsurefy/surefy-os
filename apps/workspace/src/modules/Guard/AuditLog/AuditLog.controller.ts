// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useNow, useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { auditQueries } from '@/api/audit'
import { memberQueries } from '@/api/members'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { auditLogSearchParams } from './AuditLog.searchParams'
import { getEntryHref, getNeighbors, hasActiveFilters, toEntryQuery } from './AuditLog.utils'

import type { AuditLogFilters } from './AuditLog.types'

const SEARCH_DEBOUNCE_MS = 300
const FILTER_PEOPLE_LIMIT = 100

/** Guard › Audit log: filters and the open entry in the URL, the entries as rows, the export dialog. */
export function useAuditLogController() {
  const t = useTranslations('guard.auditLog')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const now = useNow()
  const [filters, setFilters] = useQueryStates(auditLogSearchParams)
  const [isExportOpen, setIsExportOpen] = useState(false)

  const list = useInfiniteQuery(auditQueries.list(orgId, toEntryQuery(filters, now)))
  const people = useInfiniteQuery(memberQueries.list(orgId, { limit: FILTER_PEOPLE_LIMIT }))

  const rows = list.data?.pages.flatMap((page) => page.items) ?? []
  const openEntryId = filters.entry
  const neighbors = openEntryId ? getNeighbors(rows, openEntryId) : null
  const openEntry = (entryId: string) => void setFilters({ entry: entryId })

  return {
    orgId,
    filters,
    rows,
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    hasFilters: hasActiveFilters(filters),
    personOptions: (people.data?.pages.flatMap((page) => page.items) ?? []).map((member) => ({
      value: member.user.id,
      label: member.user.name,
    })),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFiltersChange: (next: Partial<AuditLogFilters>) => void setFilters(next),
    onClearFilters: () => {
      void setFilters({
        q: null,
        actor: null,
        person: null,
        action: null,
        object: null,
        result: null,
        range: null,
      })
    },
    getEntryHref: (entryId: string) => getEntryHref(filters, entryId),
    openEntryId,
    openEntryRow: rows.find((row) => row.id === openEntryId),
    onOpenEntry: openEntry,
    onPreviousEntry: neighbors?.previous
      ? () => {
          if (neighbors.previous) openEntry(neighbors.previous.id)
        }
      : undefined,
    onNextEntry: neighbors?.next
      ? () => {
          if (neighbors.next) openEntry(neighbors.next.id)
        }
      : undefined,
    onCloseEntry: () => void setFilters({ entry: null }),
    isExportOpen,
    onExportOpenChange: setIsExportOpen,
    t,
  }
}
