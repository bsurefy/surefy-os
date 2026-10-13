// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { useUpdateAgentChannelMutation } from '@/api/agents'
import { connectionQueries } from '@/api/connections'
import type { AgentChannelDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { CONNECTION_LOOKUP_LIMIT } from '../ChannelsSection.constants'

import type { MessagingChannelProps, MessagingRequest } from './MessagingChannel.types'

/** The live channel as the dialog edits it: its connection and its own settings. */
function requestOf(channel: AgentChannelDto, type: MessagingRequest['type']): MessagingRequest {
  const connectionId = channel.connection?.id ?? ''
  if (type === 'slack') {
    return {
      type,
      connectionId,
      config: channel.config.slack ?? { respondTo: 'mentions', channelIds: [] },
    }
  }
  return {
    type,
    connectionId,
    config: channel.config.whatsapp ?? { businessAccountId: '', welcomeMessage: '' },
  }
}

/**
 * Slack or WhatsApp: set up for the next publish, or changed while live. The card shows where the
 * provider must send events (and, for WhatsApp, the verify token), to paste in the provider's
 * set-up.
 */
export function useMessagingChannelController({
  type,
  channel,
  request,
  context,
  onRequestChange,
}: MessagingChannelProps) {
  const t = useTranslations('agents.editor.publish.channels')
  const tConnection = useTranslations('agents.editor.tools.connection')
  const format = useFormatter()
  const orgId = useCurrentOrgId()
  const update = useUpdateAgentChannelMutation(orgId, context.agentId, { silent: true })
  const [isEditing, setIsEditing] = useState(false)

  // a channel chosen for the next publish holds only the connection's id: the picker's list names it
  const isQueued = !channel && request !== undefined
  const connections = useInfiniteQuery({
    ...connectionQueries.list(orgId, {
      usable: true,
      providerKey: type,
      limit: CONNECTION_LOOKUP_LIMIT,
    }),
    enabled: isQueued,
  })
  const queuedConnection = connections.data?.pages
    .flatMap((page) => page.items)
    .find(({ id }) => id === request?.connectionId)

  const current = channel ? requestOf(channel, type) : request
  const connection = channel ? channel.connection : queuedConnection

  let answers: string | null = null
  if (current?.type === 'slack') {
    const { respondTo, channelIds } = current.config
    answers = t(`messaging.slack.answers.${respondTo}`, {
      count: channelIds.length,
      channels: format.list(channelIds, { type: 'conjunction' }),
    })
  } else if (current?.type === 'whatsapp' && channel?.externalAccountId) {
    answers = t('messaging.whatsapp.answers', { number: channel.externalAccountId })
  }

  const save = async (next: MessagingRequest) => {
    if (!channel) {
      onRequestChange(next)
      return
    }
    const changedConnection =
      next.connectionId === channel.connection?.id ? {} : { connectionId: next.connectionId }
    await update.mutateAsync({
      channelId: channel.id,
      input:
        next.type === 'slack'
          ? { slack: next.config, ...changedConnection }
          : { whatsapp: next.config, ...changedConnection },
    })
    toast.success(t('messaging.saved', { channel: t(`names.${type}`) }))
  }

  return {
    t,
    name: t(`names.${type}`),
    status: context.statusOf(channel, request !== undefined),
    initial: current,
    connection: connection
      ? {
          name: connection.name,
          state: connection.status === 'active' ? null : tConnection(`status.${connection.status}`),
        }
      : null,
    // a live channel whose connection was removed answers nowhere until one is chosen
    hasNoConnection: channel !== null && channel.connection === null,
    answers,
    webhook: channel?.webhook ?? null,
    isEditing,
    onEdit: () => {
      setIsEditing(true)
    },
    onCloseEdit: () => {
      setIsEditing(false)
    },
    onSave: save,
    onDrop: () => {
      onRequestChange(null)
    },
  }
}
