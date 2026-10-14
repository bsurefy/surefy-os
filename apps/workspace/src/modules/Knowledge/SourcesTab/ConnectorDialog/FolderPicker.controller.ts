// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { knowledgeQueries } from '@/api/knowledge'
import { useDebouncedValue } from '@/hooks'
import { ERROR_CODES } from '@surefy/contracts'
import type { KnowledgeConnectorItemDto, KnowledgeConnectorProvider } from '@surefy/contracts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { SEARCH_DEBOUNCE_MS } from '../../Knowledge.constants'

import type { ConnectorFolder } from './ConnectorDialog.schema'

/**
 * The folder or page picker: one level at a time with a trail back up, or the matches of a search
 * anywhere in the account. What is picked lives in the dialog's form.
 */
export function useFolderPickerController({
  orgId,
  baseId,
  connectionId,
  provider,
  selected,
  ownFolderIds = [],
  onSelectedChange,
}: {
  orgId: string
  baseId: string
  connectionId: string
  provider: KnowledgeConnectorProvider
  selected: readonly ConnectorFolder[]
  /** The folders of the source being changed: the API counts them as synced by this base. */
  ownFolderIds?: readonly string[]
  onSelectedChange: (folders: ConnectorFolder[]) => void
}) {
  const t = useTranslations('knowledge.detail.sources.connector.picker')
  const tErrors = useTranslations('errors')
  const [trail, setTrail] = useState<ConnectorFolder[]>([])
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)
  const parent = trail.at(-1)

  const list = useInfiniteQuery(
    knowledgeQueries.connectorItems(orgId, baseId, {
      connectionId,
      ...(q ? { q } : { parentId: parent?.externalId }),
    }),
  )
  const isExpired =
    isApiError(list.error) && list.error.code === ERROR_CODES.KNOWLEDGE_CONNECTION_EXPIRED
  const selectedIds = new Set(selected.map(({ externalId }) => externalId))
  const ownIds = new Set(ownFolderIds)

  return {
    t,
    // Drive has folders; Notion has pages and databases
    noun: provider === 'notion' ? ('pages' as const) : ('folders' as const),
    items: list.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: list.isPending,
    isExpired,
    errorMessage: list.error && !isExpired ? getErrorMessage(list.error, tErrors) : null,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    search,
    isSearching: q !== '',
    onSearchChange: setSearch,
    trail,
    onOpen: (item: KnowledgeConnectorItemDto) => {
      setSearch('')
      setTrail((current) => [...current, { externalId: item.externalId, name: item.name }])
    },
    /** -1 is the top level. */
    onGoTo: (index: number) => {
      setTrail((current) => current.slice(0, index + 1))
    },
    /** Synced by another source of this base: shown, but not picked twice. */
    isTaken: (item: KnowledgeConnectorItemDto) => item.inBase && !ownIds.has(item.externalId),
    isSelected: (item: KnowledgeConnectorItemDto) => selectedIds.has(item.externalId),
    onToggle: (item: KnowledgeConnectorItemDto) => {
      onSelectedChange(
        selectedIds.has(item.externalId)
          ? selected.filter(({ externalId }) => externalId !== item.externalId)
          : [...selected, { externalId: item.externalId, name: item.name }],
      )
    },
    onRemove: (folder: ConnectorFolder) => {
      onSelectedChange(selected.filter(({ externalId }) => externalId !== folder.externalId))
    },
  }
}
