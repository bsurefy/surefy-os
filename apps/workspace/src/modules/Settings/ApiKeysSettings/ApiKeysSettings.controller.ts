// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { apiKeyQueries } from '@/api/apiKeys'
import { PERMISSIONS } from '@surefy/contracts'
import type { ApiKeyDto } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { API_KEY_STATUS_FILTERS } from './ApiKeysSettings.constants'
import { apiKeysSearchParams } from './ApiKeysSettings.searchParams'
import { getApiKeyRowStatus } from './ApiKeysSettings.utils'

import type { ApiKeyDialogKind } from './ApiKeysSettings.constants'

const SEARCH_DEBOUNCE_MS = 300

export interface OpenDialog {
  kind: ApiKeyDialogKind
  /** The key the dialog is about; none for Create. */
  apiKey?: ApiKeyDto
}

/** Settings › API keys: filters in the URL, the keys, the open detail drawer and the open dialog. */
export function useApiKeysSettingsController() {
  const t = useTranslations('settings.apiKeys')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [filters, setFilters] = useQueryStates(apiKeysSearchParams)
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const canManage = useCan(PERMISSIONS.API_KEYS_MANAGE)

  const { q, status, sort, key } = filters
  const keys = useInfiniteQuery(apiKeyQueries.list(orgId, { q: q || undefined, status, sort }))
  const rows = keys.data?.pages.flatMap((page) => page.items) ?? []
  const hasFilters = q !== '' || status !== 'active'

  return {
    orgId,
    filters,
    rows,
    isLoading: keys.isPending,
    errorMessage: keys.error ? getErrorMessage(keys.error, tErrors) : null,
    errorReference: isApiError(keys.error) ? keys.error.requestId : undefined,
    refetch: () => void keys.refetch(),
    hasMore: keys.hasNextPage,
    isLoadingMore: keys.isFetchingNextPage,
    onLoadMore: () => void keys.fetchNextPage(),
    hasFilters,
    statusOptions: API_KEY_STATUS_FILTERS.map((value) => ({
      value,
      label: t(`status.${value}`),
    })),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFiltersChange: setFilters,
    onClearFilters: () => {
      void setFilters({ q: null, status: null })
    },
    canManage,
    /** The key whose drawer is open (`?key=`), once it is among the loaded rows. */
    openKey: key ? rows.find((row) => row.id === key) : undefined,
    onOpenKey: (apiKey: ApiKeyDto) => void setFilters({ key: apiKey.id }),
    onCloseKey: () => void setFilters({ key: null }),
    /** Whether another key could take over, so Revoke suggests rotating. */
    hasOtherActiveKeys: (apiKey: ApiKeyDto) =>
      rows.some((row) => row.id !== apiKey.id && getApiKeyRowStatus(row) === 'active'),
    dialog,
    openDialog: setDialog,
    closeDialog: () => {
      setDialog(null)
    },
    t,
  }
}
