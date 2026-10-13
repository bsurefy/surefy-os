// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useUpdateAgentChannelMutation } from '@/api/agents'
import type { WidgetChannelConfig } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { buildEmbedSnippet } from '../ChannelsSection.utils'

import type { WidgetChannelProps } from './WidgetChannel.types'

/**
 * The website widget: set up for the next publish, or changed while live. The embed code with its
 * token is shown once, after the publish that turned it on or after a new code.
 */
export function useWidgetChannelController({
  channel,
  request,
  context,
  apiBaseUrl,
  onRequestChange,
  widgetToken,
}: WidgetChannelProps) {
  const t = useTranslations('agents.editor.publish.channels')
  const orgId = useCurrentOrgId()
  const update = useUpdateAgentChannelMutation(orgId, context.agentId, { silent: true })
  const [isEditing, setIsEditing] = useState(false)

  const config = channel ? channel.config.widget : request?.config

  const save = async (next: WidgetChannelConfig) => {
    if (channel) {
      await update.mutateAsync({ channelId: channel.id, input: { widget: next } })
      toast.success(t('widget.saved'))
    } else {
      onRequestChange({ type: 'widget', config: next })
    }
  }

  return {
    t,
    status: context.statusOf(channel, request !== undefined),
    config,
    summary: config && {
      origins: config.allowedOrigins,
      look: t('widget.look', {
        theme: t(`widget.dialog.theme.${config.theme}`),
        position: t(`widget.dialog.position.${config.position}`),
      }),
    },
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
    snippet: widgetToken === null ? null : buildEmbedSnippet(apiBaseUrl, widgetToken),
  }
}
