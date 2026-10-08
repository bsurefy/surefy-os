// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'

import { knowledgeQueries } from '@/api/knowledge'
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'

import { DEFAULT_API_RATE_LIMIT, KNOWLEDGE_LOOKUP_LIMIT } from './ChannelsSection.constants'

import type { ChannelsSectionProps, ChannelStatus } from './ChannelsSection.types'

const STATUS_TONES = {
  active: 'success',
  pending_approval: 'warning',
  paused: 'warning',
  error: 'destructive',
  disconnected: 'neutral',
} as const satisfies Record<ChannelStatus, StatusTone>

/**
 * Channels: SurefyOS chat goes live with the first publish; the API is turned on here (a request
 * for Builders) and shows how to call the agent. There is no signed-in person on the API, so the
 * agent uses its own knowledge and tools, and the card says which.
 */
export function useChannelsSectionController({ agent, definition }: ChannelsSectionProps) {
  const t = useTranslations('agents.editor.publish.channels')
  const format = useFormatter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const orgId = useCurrentOrgId()
  const canPublishExternal = useCan(PERMISSIONS.AGENTS_PUBLISH_EXTERNAL)
  const canManageKeys = useCan(PERMISSIONS.API_KEYS_MANAGE)
  const bases = useInfiniteQuery(knowledgeQueries.list(orgId, { limit: KNOWLEDGE_LOOKUP_LIMIT }))

  const chat = agent.channels.find((channel) => channel.type === 'workspace_chat') ?? null
  const api = agent.channels.find((channel) => channel.type === 'api') ?? null

  const baseNames = definition.knowledge.knowledgeBaseIds.flatMap((id) => {
    const base = bases.data?.pages.flatMap((page) => page.items).find((item) => item.id === id)
    return base ? [base.name] : []
  })
  const toolNames = definition.tools.filter((tool) => tool.enabled).map((tool) => tool.name)
  const exposed = [...baseNames, ...toolNames]

  const host = typeof window === 'undefined' ? '' : window.location.origin
  const endpoint = `${host}/api/v1/orgs/${orgId}/agents/${agent.id}/runs`
  const curl = (query = '') =>
    [
      `curl -X POST "${endpoint}${query}" \\`,
      `  -H "Authorization: Bearer sk_..." \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"input": "Hello"}'`,
    ].join('\n')

  let unavailable: 'notPublished' | 'paused' | 'archived' | null = null
  if (agent.status === 'archived') unavailable = 'archived'
  else if (agent.status === 'paused') unavailable = 'paused'
  else if (agent.liveVersion === null) unavailable = 'notPublished'

  return {
    t,
    chat: chat && { status: chat.status, tone: STATUS_TONES[chat.status] },
    api: api && {
      status: api.status,
      tone: STATUS_TONES[api.status],
      rateLimit: api.config.api?.rateLimitPerMinute ?? DEFAULT_API_RATE_LIMIT,
    },
    rateLimit: DEFAULT_API_RATE_LIMIT,
    // Builders ask, Admins and Owners turn it on
    isRequest: !canPublishExternal,
    canManageKeys,
    keysHref: ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.API_KEYS),
    exposure: exposed.length > 0 ? format.list(exposed, { type: 'conjunction' }) : null,
    streamExample: curl('?stream=true'),
    example: curl(),
    unavailable,
  }
}
