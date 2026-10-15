// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { debounce, useQueryStates } from 'nuqs'
import { useState } from 'react'

import { connectionQueries } from '@/api/connections'
import {
  knowledgeQueries,
  useBulkKnowledgeSourcesMutation,
  useRetryKnowledgeSourceMutation,
  useSyncKnowledgeSourceMutation,
} from '@/api/knowledge'
import { ROUTES } from '@/constants/routes'
import { KNOWLEDGE_CONNECTOR_PROVIDERS, PERMISSIONS } from '@surefy/contracts'
import type {
  ConnectionDto,
  KnowledgeBaseDto,
  KnowledgeConnectorProvider,
  KnowledgeSourceDto,
} from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { SEARCH_DEBOUNCE_MS } from '../Knowledge.constants'
import { CONNECTION_LOOKUP_LIMIT, CONNECTOR_SOURCES_LIMIT } from './SourcesTab.constants'
import { useCanReconnect } from './SourcesTab.hooks'
import { sourcesSearchParams } from './SourcesTab.searchParams'
import { useKnowledgeUploads } from './SourcesTab.uploads'
import { groupExpiredByConnection, toStatusParam } from './SourcesTab.utils'

import type { SourceSort, SourceStatusFilter } from './SourcesTab.constants'

/**
 * The Sources tab: the table with its filters in the URL, selection and actions, adding files,
 * links and connectors, and Reconnect for connectors whose sign-in expired.
 */
export function useSourcesTabController(base: KnowledgeBaseDto) {
  const t = useTranslations('knowledge.detail.sources')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const canManage = base.effectiveLevel === 'manage'
  const canOpenVault = useCan(PERMISSIONS.VAULT_MANAGE)
  const [params, setParams] = useQueryStates(sourcesSearchParams)
  const [selection, setSelection] = useState<Record<string, true>>({})
  const [isAddingLink, setIsAddingLink] = useState(false)
  const [removing, setRemoving] = useState<readonly KnowledgeSourceDto[] | null>(null)
  const [editing, setEditing] = useState<KnowledgeSourceDto | null>(null)
  const [reconnecting, setReconnecting] = useState<ConnectionDto | null>(null)
  const canReconnect = useCanReconnect()
  const uploads = useKnowledgeUploads(orgId, base.id)
  const retry = useRetryKnowledgeSourceMutation(orgId, base.id)
  const sync = useSyncKnowledgeSourceMutation(orgId, base.id)
  const bulk = useBulkKnowledgeSourcesMutation(orgId, base.id)

  const list = useInfiniteQuery(
    knowledgeQueries.sources(orgId, base.id, {
      q: params.q || undefined,
      status: toStatusParam(params.status),
      sort: params.sort,
    }),
  )
  const sources = list.data?.pages.flatMap((page) => page.items) ?? []
  // A shared link can open a source that is not on the pages loaded so far
  const isOnPage = sources.some(({ id }) => id === params.source)
  const linked = useQuery({
    ...knowledgeQueries.source(orgId, base.id, params.source ?? ''),
    enabled: Boolean(params.source) && !isOnPage && !list.isPending,
  })
  // Connectors in use and expired sign-ins, whatever the table's filters say
  const connectorList = useInfiniteQuery({
    ...knowledgeQueries.sources(orgId, base.id, {
      type: 'connector',
      limit: CONNECTOR_SOURCES_LIMIT,
    }),
    enabled: canManage,
  })
  const connectorSources = connectorList.data?.pages.flatMap((page) => page.items) ?? []
  const expiredGroups = groupExpiredByConnection(connectorSources)
  const connections = useInfiniteQuery({
    ...connectionQueries.list(orgId, {
      kind: 'knowledge_connector',
      limit: CONNECTION_LOOKUP_LIMIT,
    }),
    enabled: canManage && expiredGroups.length > 0,
  })
  const connectionById = new Map(
    (connections.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item]),
  )
  const sourceCounts = Object.fromEntries(
    KNOWLEDGE_CONNECTOR_PROVIDERS.map((provider) => [
      provider,
      connectorSources.filter(({ connector }) => connector?.provider === provider).length,
    ]),
  ) as Record<KnowledgeConnectorProvider, number>
  const canAdd = canManage && base.embeddingModel !== null
  const selectedIds = Object.keys(selection)
  const hasFilters = params.q !== '' || params.status !== 'all'

  return {
    t,
    orgId,
    base,
    canManage,
    canOpenVault,
    // Adding needs an embedding model; a local-only base needs a local one (the API picks it)
    canAdd,
    params,
    sources,
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    hasFilters,
    uploads,
    selection,
    selectedSources: sources.filter(({ id }) => selectedIds.includes(id)),
    onSelectionChange: setSelection,
    onSearchChange: (value: string) =>
      void setParams(
        { q: value || null },
        { limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS), history: 'replace' },
      ),
    onStatusChange: (status: SourceStatusFilter) =>
      void setParams({ status: status === 'all' ? null : status }),
    onSortChange: (sort: SourceSort) =>
      void setParams({ sort: sort === '-createdAt' ? null : sort }),
    onClearFilters: () => void setParams({ q: null, status: null }),
    onShowFailed: () => void setParams({ status: 'failed' }),
    openSource: sources.find(({ id }) => id === params.source) ?? linked.data,
    getSourceHref: (sourceId: string) => `?source=${sourceId}`,
    onClosePreview: () => void setParams({ source: null }),
    isAddingLink,
    onAddLink: () => {
      setIsAddingLink(true)
    },
    onCloseAddLink: () => {
      setIsAddingLink(false)
    },
    sourceCounts,
    connecting: canAdd ? params.connect : null,
    onConnect: (provider: KnowledgeConnectorProvider) => void setParams({ connect: provider }),
    onCloseConnect: () => void setParams({ connect: null }),
    editing,
    onEditConnector: (source: KnowledgeSourceDto) => {
      setEditing(source)
    },
    onCloseEdit: () => {
      setEditing(null)
    },
    /** Connections whose sign-in expired, with the sources they pause; `connection` when it is listed. */
    expiredSignIns: expiredGroups.map((group) => ({
      ...group,
      provider: group.sources[0]?.connector?.provider ?? 'google_drive',
      connection: connectionById.get(group.connectionId) ?? null,
    })),
    canReconnect: (connection: ConnectionDto | null) =>
      connection !== null && canReconnect(connection),
    getConnection: (source: KnowledgeSourceDto) =>
      source.connectionId ? (connectionById.get(source.connectionId) ?? null) : null,
    reconnecting,
    onReconnect: (connection: ConnectionDto) => {
      setReconnecting(connection)
    },
    onCloseReconnect: () => {
      setReconnecting(null)
    },
    reconnectReturnTo: ROUTES.workspace.knowledgeBase(orgSlug, base.id, 'sources'),
    removing,
    onRemove: (targets: readonly KnowledgeSourceDto[]) => {
      setRemoving(targets)
    },
    onCloseRemove: () => {
      setRemoving(null)
    },
    onRemoved: () => {
      setRemoving(null)
      setSelection({})
    },
    onRetry: (source: KnowledgeSourceDto, withOcr: boolean) => {
      retry.mutate({ sourceId: source.id, withOcr })
    },
    onSync: (source: KnowledgeSourceDto) => {
      sync.mutate(source.id, {
        onSuccess: () => {
          toast.success(t('toasts.syncStarted', { name: source.name }))
        },
      })
    },
    onReindexSelected: () => {
      bulk.mutate(
        { action: 'reindex', sourceIds: selectedIds },
        {
          onSuccess: (result) => {
            toast.success(t('toasts.reindexStarted', { count: result.affected }))
            setSelection({})
          },
        },
      )
    },
    isBulkPending: bulk.isPending,
  }
}
