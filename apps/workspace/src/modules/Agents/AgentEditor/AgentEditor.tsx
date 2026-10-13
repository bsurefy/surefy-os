// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BotOff } from 'lucide-react'
import Link from 'next/link'

import { toRoute } from '@/modules/Workspace'
import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useAgentEditorController } from './AgentEditor.controller'
import AgentEditorWorkspace from './AgentEditorWorkspace'

/**
 * The agent editor: the agent named by the route, with its header, tabs and autosave. The layout
 * above the tab pages renders it, so the working copy stays when the person moves between tabs.
 */
export default function AgentEditor() {
  const c = useAgentEditorController()
  const { t, agent } = c

  if (c.isLoading) {
    return (
      <div role="status" aria-label={t('loading')} className="flex flex-col gap-6">
        <Skeleton className="h-3.5 w-40" />
        <div className="flex items-start gap-3.5">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <div className="border-border flex gap-2 border-b pb-2">
          {[0, 1, 2, 3, 4].map((tab) => (
            <Skeleton key={tab} className="h-7 w-20" />
          ))}
        </div>
        <SkeletonCard lines={6} />
      </div>
    )
  }
  if (c.isNotFound) {
    return (
      <EmptyState
        icon={BotOff}
        title={t('notFound.title')}
        description={t('notFound.description')}
        secondaryAction={
          <Button asChild variant="secondary">
            <Link href={toRoute(c.agentsHref)}>{t('notFound.back')}</Link>
          </Button>
        }
      />
    )
  }
  if (!agent) {
    return (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage ?? ''}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  }
  return <AgentEditorWorkspace key={agent.id} agent={agent} activeTab={c.activeTab} />
}
