// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { guardQueries, useUpdateGuardrailMutation } from '@/api/guard'
import { PERMISSIONS } from '@surefy/contracts'
import type { GuardRuleRowDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { ANY, NEW_RULE } from './Guardrails.constants'
import { guardrailsSearchParams } from './Guardrails.searchParams'
import { filterValue, statusToEnabled, toSortParam, toSortState } from './Guardrails.utils'

const SEARCH_DEBOUNCE_MS = 300

/** Guard › Guardrails: filters in the URL, the rules, the open sheet and the switch-off dialog. */
export function useGuardrailsController() {
  const t = useTranslations('guard.guardrails')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [filters, setFilters] = useQueryStates(guardrailsSearchParams)
  const [turningOff, setTurningOff] = useState<GuardRuleRowDto | null>(null)
  const [turnOffError, setTurnOffError] = useState<string | null>(null)
  const canManage = useCan(PERMISSIONS.GUARD_MANAGE)
  const canLock = useCan(PERMISSIONS.GUARD_LOCK)
  const update = useUpdateGuardrailMutation(orgId, { silent: true })

  const { q, type, scope, status, sort, rule } = filters
  const list = useInfiniteQuery(
    guardQueries.rules(orgId, {
      q: q || undefined,
      type: filterValue(type),
      scope: filterValue(scope),
      isEnabled: statusToEnabled(status),
      sort,
    }),
  )
  const rows = list.data?.pages.flatMap((page) => page.items) ?? []
  const hasFilters = q !== '' || type !== ANY || scope !== ANY || status !== ANY

  return {
    t,
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
    hasFilters,
    canManage,
    canLock,
    sortState: toSortState(sort),
    onSortChange: (next: { id: string; desc: boolean }) =>
      void setFilters({ sort: toSortParam(next) as typeof sort }),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFiltersChange: setFilters,
    onClearFilters: () => {
      void setFilters({ q: null, type: null, scope: null, status: null })
    },
    /** The open sheet: a guardrail id, `new`, or none. */
    openRule: rule,
    openRow: rule && rule !== NEW_RULE ? rows.find((row) => row.id === rule) : undefined,
    onOpenRule: (row: GuardRuleRowDto) => void setFilters({ rule: row.id }),
    onAddRule: () => void setFilters({ rule: NEW_RULE }),
    onCloseRule: () => void setFilters({ rule: null }),
    /** Anyone who manages may switch a stored rule; a locked one only an Owner. */
    canToggle: (row: GuardRuleRowDto) =>
      canManage && row.editTarget === null && (!row.isLocked || canLock),
    onToggle: (row: GuardRuleRowDto, isEnabled: boolean) => {
      if (!isEnabled) {
        setTurnOffError(null)
        setTurningOff(row)
        return
      }
      // turning a rule on tightens Guard: it saves at once
      update.mutate(
        { guardrailId: row.id, isEnabled: true },
        {
          onSuccess: () => toast.success(t('turnedOn', { name: row.name })),
          onError: (error) => toast.error(getErrorMessage(error, tErrors)),
        },
      )
    },
    turningOff,
    turnOffError,
    onCloseTurnOff: () => {
      setTurningOff(null)
    },
    onConfirmTurnOff: async (reason: string) => {
      if (!turningOff) return
      try {
        await update.mutateAsync({ guardrailId: turningOff.id, isEnabled: false, reason })
        toast.success(t('turnedOff', { name: turningOff.name }))
      } catch (error) {
        setTurnOffError(getErrorMessage(error, tErrors))
        throw error
      }
    },
  }
}
