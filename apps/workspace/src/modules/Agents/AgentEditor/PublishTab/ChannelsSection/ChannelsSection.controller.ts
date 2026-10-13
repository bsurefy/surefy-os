// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'

import { knowledgeQueries } from '@/api/knowledge'
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import { getApiBaseUrl } from '@/modules/Settings/ApiKeysSettings/ApiKeysSettings.utils'
import { PERMISSIONS } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'

import { DEFAULT_API_RATE_LIMIT, KNOWLEDGE_LOOKUP_LIMIT } from './ChannelsSection.constants'
import { currentChannelOf, requestOf } from './ChannelsSection.utils'

import type {
  ChannelCardContext,
  ChannelsSectionProps,
  ChannelStatus,
} from './ChannelsSection.types'

const STATUS_TONES = {
  active: 'success',
  pending_approval: 'warning',
  paused: 'warning',
  error: 'destructive',
  disconnected: 'neutral',
} as const satisfies Record<ChannelStatus, StatusTone>

/**
 * Channels: SurefyOS chat goes live with the first publish; the API, the website widget, Slack and
 * WhatsApp are set up here and go live with the next publish (a request for Builders). A live
 * channel changes at once. There is no signed-in person on an external channel, so the agent uses
 * its own knowledge and tools, and each card says which.
 */
export function useChannelsSectionController({
  agent,
  definition,
  canChange,
  requests,
  onRequestChange,
}: ChannelsSectionProps) {
  const t = useTranslations('agents.editor.publish.channels')
  const format = useFormatter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const orgId = useCurrentOrgId()
  const canPublishExternal = useCan(PERMISSIONS.AGENTS_PUBLISH_EXTERNAL)
  const canManageKeys = useCan(PERMISSIONS.API_KEYS_MANAGE)
  const bases = useInfiniteQuery(knowledgeQueries.list(orgId, { limit: KNOWLEDGE_LOOKUP_LIMIT }))

  const chat = currentChannelOf(agent.channels, 'workspace_chat')
  const api = currentChannelOf(agent.channels, 'api')

  const baseNames = definition.knowledge.knowledgeBaseIds.flatMap((id) => {
    const base = bases.data?.pages.flatMap((page) => page.items).find((item) => item.id === id)
    return base ? [base.name] : []
  })
  const toolNames = definition.tools.filter((tool) => tool.enabled).map((tool) => tool.name)
  const exposed = [...baseNames, ...toolNames]

  const apiBaseUrl = typeof window === 'undefined' ? '' : getApiBaseUrl(window.location.origin)
  const endpoint = `${apiBaseUrl}/api/v1/orgs/${orgId}/agents/${agent.id}/runs`
  const curl = (query = '') =>
    [
      `curl -X POST "${endpoint}${query}" \\`,
      `  -H "Authorization: Bearer sk_..." \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"input": "Hello"}'`,
    ].join('\n')

  let unavailable: ChannelCardContext['unavailable'] = null
  if (agent.status === 'archived') unavailable = 'archived'
  else if (agent.status === 'paused') unavailable = 'paused'
  else if (agent.liveVersion === null) unavailable = 'notPublished'

  const context: ChannelCardContext = {
    agentId: agent.id,
    canChange,
    canManage: canChange && canPublishExternal,
    exposure: exposed.length > 0 ? format.list(exposed, { type: 'conjunction' }) : null,
    unavailable,
    statusOf: (channel, isRequested) => {
      if (channel)
        return { label: t(`status.${channel.status}`), tone: STATUS_TONES[channel.status] }
      return isRequested
        ? { label: t('status.next'), tone: 'info' }
        : { label: t('status.off'), tone: 'neutral' }
    },
  }

  return {
    t,
    context,
    apiBaseUrl,
    chat,
    api,
    apiRateLimit: api?.config.api?.rateLimitPerMinute ?? DEFAULT_API_RATE_LIMIT,
    wantsApi: requestOf(requests, 'api') !== undefined,
    widgetRequest: requestOf(requests, 'widget'),
    slackRequest: requestOf(requests, 'slack'),
    whatsappRequest: requestOf(requests, 'whatsapp'),
    onWantsApiChange: (wants: boolean) => {
      onRequestChange('api', wants ? { type: 'api' } : null)
    },
    widget: currentChannelOf(agent.channels, 'widget'),
    slack: currentChannelOf(agent.channels, 'slack'),
    whatsapp: currentChannelOf(agent.channels, 'whatsapp'),
    // Builders ask, Admins and Owners turn it on
    isRequest: !canPublishExternal,
    canManageKeys,
    keysHref: ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.API_KEYS),
    streamExample: curl('?stream=true'),
    example: curl(),
  }
}
