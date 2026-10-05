// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { knowledgeQueries } from '@/api/knowledge'
import { ROUTES } from '@/constants/routes'
import { ERROR_CODES } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { KNOWLEDGE_TABS } from '../Knowledge.constants'
import { canManageBase, getKnowledgeTab } from '../Knowledge.utils'

import type { KnowledgeTab } from '../Knowledge.constants'

/** The dialogs the header menu and the Settings tab open over a base. */
export type BaseDialog = 'rename' | 'reindex' | 'delete'

/** One knowledge base: the base itself (polled while it is indexing), the open tab from the route, the dialogs. */
export function useKnowledgeBaseDetailController() {
  const t = useTranslations('knowledge.detail')
  const tErrors = useTranslations('errors')
  const { orgSlug, kbId, tab } = useParams<{ orgSlug: string; kbId: string; tab?: string }>()
  const orgId = useCurrentOrgId()
  const [dialog, setDialog] = useState<BaseDialog | null>(null)
  const query = useQuery(knowledgeQueries.detail(orgId, kbId))
  const base = query.data
  const canManage = base ? canManageBase(base) : false
  const activeTab = getKnowledgeTab(tab)
  // People who can only search see the sources; the other tabs are for people who manage the base
  const tabs: KnowledgeTab[] = canManage ? [...KNOWLEDGE_TABS] : ['sources']

  return {
    t,
    orgId,
    orgSlug,
    baseId: kbId,
    base,
    canManage,
    isLoading: query.isPending,
    isNotFound: isApiError(query.error) && query.error.code === ERROR_CODES.KNOWLEDGE_NOT_FOUND,
    errorMessage: query.error ? getErrorMessage(query.error, tErrors) : null,
    errorReference: isApiError(query.error) ? query.error.requestId : undefined,
    refetch: () => void query.refetch(),
    activeTab: tabs.includes(activeTab) ? activeTab : 'sources',
    tabs: tabs.map((value) => ({
      value,
      label: t(`tabs.${value}`),
      href: ROUTES.workspace.knowledgeBase(orgSlug, kbId, value),
    })),
    libraryHref: ROUTES.workspace.knowledge(orgSlug),
    dialog,
    openDialog: setDialog,
    closeDialog: () => {
      setDialog(null)
    },
  }
}
