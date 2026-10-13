// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { agentQueries } from '@/api/agents'
import { PERMISSIONS } from '@surefy/contracts'
import type { AgentVersionDto } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import type { VersionsTabProps } from './VersionsTab.types'

/**
 * Versions: every published version, newest first, with what each one changed, and the way back
 * to an earlier one. Rolling back needs the right to publish and an agent that can be edited.
 */
export function useVersionsTabController({ agent, isReadOnly }: VersionsTabProps) {
  const t = useTranslations('agents.editor.versions')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const canPublish = useCan(PERMISSIONS.AGENTS_PUBLISH)
  const list = useInfiniteQuery(agentQueries.versionList(orgId, agent.id))
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<AgentVersionDto | null>(null)

  const versions = list.data?.pages.flatMap((page) => page.items) ?? []

  /**
   * The version before this one, to read what it changed. For the last loaded version it may be
   * on the next page: that page is loaded first.
   */
  const onToggle = async (version: AgentVersionDto, index: number) => {
    if (expandedId === version.id) {
      setExpandedId(null)
      return
    }
    const isLastLoaded = index === versions.length - 1
    if (isLastLoaded && list.hasNextPage) await list.fetchNextPage()
    setExpandedId(version.id)
  }

  return {
    t,
    orgId,
    agentId: agent.id,
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    versions,
    canRollBack: canPublish && !isReadOnly,
    expandedId,
    onToggle,
    rollbackTarget,
    onRollback: setRollbackTarget,
    onCloseRollback: () => {
      setRollbackTarget(null)
    },
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  }
}
