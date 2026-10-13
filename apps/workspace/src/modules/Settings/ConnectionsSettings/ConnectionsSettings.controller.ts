// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { connectionQueries, useTestConnectionMutation } from '@/api/connections'
import { PAGE_SIZE, PERMISSIONS } from '@surefy/contracts'
import type { ConnectionDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { meQueries } from '@surefy/web-core/api/me'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import {
  ANY_FILTER,
  CONNECTION_ATTENTION_STATUSES,
  CONNECTION_KIND_FILTERS,
  CONNECTION_SCOPE_FILTERS,
  CONNECTION_STATUS_FILTERS,
  CONNECTION_STATUS_GROUPS,
} from './ConnectionsSettings.constants'
import { useIsOnline } from './ConnectionsSettings.hooks'
import { connectionsSearchParams } from './ConnectionsSettings.searchParams'
import { getReasonKey, sortAttentionFirst } from './ConnectionsSettings.utils'

import type { ConnectionDialogKind } from './ConnectionsSettings.constants'

const SEARCH_DEBOUNCE_MS = 300

export interface OpenDialog {
  kind: ConnectionDialogKind
  /** The connection the dialog is about; none for Add. */
  connection?: ConnectionDto
}

/** Settings › Connections: filters in the URL, the connections, the attention count and the open dialog. */
export function useConnectionsSettingsController() {
  const t = useTranslations('settings.connections')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const isOnline = useIsOnline()
  const [filters, setFilters] = useQueryStates(connectionsSearchParams)
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const canManage = useCan(PERMISSIONS.CONNECTIONS_MANAGE)
  const { data: me } = useQuery(meQueries.current())
  const test = useTestConnectionMutation(orgId, { silent: true })

  const { q, app, kind, scope, status, sort } = filters
  const connections = useInfiniteQuery(
    connectionQueries.list(orgId, {
      q: q || undefined,
      providerKey: app ?? undefined,
      kind: kind ?? undefined,
      scope: scope ?? undefined,
      status: CONNECTION_STATUS_GROUPS[status],
      sort,
    }),
  )
  // the banner counts every connection that needs attention, whatever the filters say
  const attention = useInfiniteQuery(
    connectionQueries.list(orgId, { status: CONNECTION_ATTENTION_STATUSES, limit: PAGE_SIZE.max }),
  )
  const providers = useQuery(connectionQueries.providers(orgId))

  const loaded = connections.data?.pages.flatMap((page) => page.items) ?? []
  const rows = status === 'disconnected' ? loaded : sortAttentionFirst(loaded)
  const attentionCount = attention.data?.pages[0]?.items.length ?? 0
  const hasFilters = q !== '' || app !== null || kind !== null || scope !== null || status !== 'all'

  const providerName = (providerKey: string) =>
    t.has(`apps.${providerKey}`) ? t(`apps.${providerKey}`) : providerKey

  return {
    orgId,
    filters,
    rows,
    isLoading: connections.isPending,
    errorMessage: connections.error ? getErrorMessage(connections.error, tErrors) : null,
    errorReference: isApiError(connections.error) ? connections.error.requestId : undefined,
    refetch: () => void connections.refetch(),
    hasMore: connections.hasNextPage,
    isLoadingMore: connections.isFetchingNextPage,
    onLoadMore: () => void connections.fetchNextPage(),
    hasFilters,
    attentionCount,
    canManage,
    userId: me?.user.id,
    isOnline,
    providerName,
    appOptions: [
      { value: ANY_FILTER, label: t('filters.anyApp') },
      ...(providers.data ?? []).map(({ providerKey }) => ({
        value: providerKey,
        label: providerName(providerKey),
      })),
    ],
    kindOptions: [
      { value: ANY_FILTER, label: t('filters.anyKind') },
      ...CONNECTION_KIND_FILTERS.map((value) => ({ value, label: t(`kindFilters.${value}`) })),
    ],
    scopeOptions: [
      { value: ANY_FILTER, label: t('filters.anyScope') },
      ...CONNECTION_SCOPE_FILTERS.map((value) => ({ value, label: t(`scopeFilters.${value}`) })),
    ],
    statusOptions: CONNECTION_STATUS_FILTERS.map((value) => ({
      value,
      label: t(`statusFilters.${value}`),
    })),
    onSearchChange: (value: string) =>
      void setFilters(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onFiltersChange: setFilters,
    onClearFilters: () => {
      void setFilters({ q: null, app: null, kind: null, scope: null, status: null })
    },
    onShowAttention: () => void setFilters({ status: 'attention' }),
    /** Checks the connection now; the row's status follows the answer. */
    onTest: async (connection: ConnectionDto) => {
      try {
        const result = await test.mutateAsync(connection.id)
        if (result.ok) {
          toast.success(t('test.ok', { name: connection.name }))
        } else {
          toast.error(
            t('test.failed', {
              name: connection.name,
              reason: t(`reasons.${getReasonKey(result.reasonCode) ?? 'unknown'}`),
            }),
          )
        }
      } catch (error) {
        toast.error(getErrorMessage(error, tErrors))
      }
    },
    testingId: test.isPending ? test.variables : undefined,
    dialog,
    openDialog: setDialog,
    closeDialog: () => {
      setDialog(null)
    },
    t,
  }
}
