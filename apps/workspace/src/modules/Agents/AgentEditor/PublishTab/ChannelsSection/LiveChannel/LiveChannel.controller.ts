// SPDX-License-Identifier: AGPL-3.0-only
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  useAgentChannelActionMutation,
  useRemoveAgentChannelMutation,
  useRotateAgentChannelTokenMutation,
} from '@/api/agents'
import { ROUTES } from '@/constants/routes'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage } from '@surefy/web-core/errors'

import type { LiveChannelProps } from './LiveChannel.types'

export type LiveChannelConfirm = 'pause' | 'turnOff' | 'newCode'

/**
 * What a channel that exists can do now. Waiting for an admin: the request can be taken back.
 * Live: Admins and Owners pause, resume, turn off and give the widget a new code. A widget
 * approved after a Builder's request offers its code once. A channel in error says why and how to
 * reconnect.
 */
export function useLiveChannelController({
  channel,
  name,
  context,
  onWidgetTokenChange,
}: LiveChannelProps) {
  const t = useTranslations('agents.editor.publish.channels.live')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const action = useAgentChannelActionMutation(orgId, channel.agentId, { silent: true })
  const rotate = useRotateAgentChannelTokenMutation(orgId, channel.agentId, { silent: true })
  const remove = useRemoveAgentChannelMutation(orgId, channel.agentId, { silent: true })
  const [confirming, setConfirming] = useState<LiveChannelConfirm | null>(null)

  const isWaiting = channel.status === 'pending_approval'
  const isWidget = channel.type === 'widget'
  const hasCode = channel.publicTokenPrefix !== null

  const failed = (error: unknown) => {
    toast.error(getErrorMessage(error, tErrors))
  }

  const issueCode = async () => {
    const created = await rotate.mutateAsync(channel.id)
    if (created.token) onWidgetTokenChange(created.token)
  }

  const confirmErrors = { pause: action.error, turnOff: remove.error, newCode: rotate.error }
  const confirmError = confirming === null ? null : confirmErrors[confirming]

  const reason =
    channel.lastErrorCode !== null && tErrors.has(channel.lastErrorCode)
      ? tErrors(channel.lastErrorCode)
      : tErrors('fallback')

  return {
    t,
    isWaiting,
    isError: channel.status === 'error',
    isPaused: channel.status === 'paused',
    reason,
    connectionsHref: ROUTES.workspace.settings(orgSlug, 'connections'),
    // a Builder takes back their own request; an Admin may too, or decide it in Approvals
    canWithdraw: isWaiting && context.canChange,
    // the first code of a widget approved after a request: anyone who can publish, once
    canGetCode: isWidget && !hasCode && channel.status === 'active' && context.canChange,
    canNewCode: isWidget && hasCode && !isWaiting && context.canManage,
    canPause: channel.status === 'active' && context.canManage,
    canResume: (channel.status === 'paused' || channel.status === 'error') && context.canManage,
    canTurnOff: !isWaiting && context.canManage,
    isWorking: action.isPending || rotate.isPending || remove.isPending,
    confirming,
    onConfirm: setConfirming,
    onCloseConfirm: () => {
      setConfirming(null)
    },
    confirmError: confirmError === null ? undefined : getErrorMessage(confirmError, tErrors),
    onWithdraw: () => {
      remove.mutate(channel.id, {
        onSuccess: () => toast.success(t('withdrawn', { channel: name })),
        onError: failed,
      })
    },
    onResume: () => {
      action.mutate(
        { channelId: channel.id, action: 'resume' },
        { onSuccess: () => toast.success(t('resumed', { channel: name })), onError: failed },
      )
    },
    onGetCode: () => {
      issueCode().catch(failed)
    },
    onPause: async () => {
      await action.mutateAsync({ channelId: channel.id, action: 'pause' })
      toast.success(t('paused', { channel: name }))
    },
    onTurnOff: async () => {
      await remove.mutateAsync(channel.id)
      toast.success(t('turnedOff', { channel: name }))
    },
    onNewCode: issueCode,
  }
}
