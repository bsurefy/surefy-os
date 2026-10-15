// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { Bot } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { agentQueries } from '@/api/agents'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { cn } from '@surefy/ui/lib/utils'
import { useCan } from '@surefy/web-core/access'

import { AGENTS_SHOWN } from '../ChatList.constants'

/**
 * "Agents shared with you" (chat.md §1): each agent starts a new chat with it. Hidden while the
 * person has none, so a workspace without agents keeps a short list.
 */
export default function AgentsSection({
  orgId,
  orgSlug,
  activeAgentId,
}: Readonly<{ orgId: string; orgSlug: string; activeAgentId: string | null }>) {
  const t = useTranslations('chat.list.agents')
  const headingId = useId()
  const canUseAgents = useCan(PERMISSIONS.AGENTS_INVOKE)
  const list = useInfiniteQuery({
    ...agentQueries.usable(orgId, { limit: AGENTS_SHOWN }),
    enabled: canUseAgents,
  })
  const agents = list.data?.pages.flatMap((page) => page.items) ?? []
  if (!canUseAgents || agents.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-0.5">
      <h3 id={headingId} className="text-overline text-muted-foreground px-2 pt-2 pb-1">
        {t('title')}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {agents.map((agent) => {
          const isActive = agent.id === activeAgentId
          return (
            <li key={agent.id}>
              <Link
                href={toRoute(`${ROUTES.workspace.chat(orgSlug)}?agent=${agent.id}`)}
                aria-current={isActive ? 'page' : undefined}
                title={agent.description ?? undefined}
                className={cn(
                  'text-label hover:bg-surface-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5',
                  isActive &&
                    'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft font-medium',
                )}
              >
                <Bot aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
                <span className="truncate">{agent.name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <LoadMore
        label={t('more')}
        hasMore={list.hasNextPage}
        isLoading={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
      />
    </section>
  )
}
