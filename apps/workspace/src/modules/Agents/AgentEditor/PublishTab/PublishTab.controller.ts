// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { agentKeys, agentQueries, usePublishAgentMutation } from '@/api/agents'
import { ROUTES } from '@/constants/routes'
import { diffAgentDefinitions, ERROR_CODES, PERMISSIONS } from '@surefy/contracts'
import type { AgentDetailDto, AgentReadinessItemDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { toSaveableDefinition } from '../AgentEditor.utils'
import { getBlockedReason } from './PublishTab.utils'

import type { PublishTabProps } from './PublishTab.types'

/**
 * Publish: the readiness of the draft, who can use the agent, where it answers, what changes
 * against the live version, and the Publish button. The draft is saved first, then published on
 * the revision it is at; a draft that moved is a conflict. A failed publish changes nothing.
 */
export function usePublishTabController({
  agent,
  definition,
  isReadOnly,
  saveStatus,
  onFlush,
  onPublished,
  onConflict,
}: PublishTabProps) {
  const t = useTranslations('agents.editor.publish')
  const tErrors = useTranslations('errors')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const orgId = useCurrentOrgId()
  const queryClient = useQueryClient()
  const canPublish = useCan(PERMISSIONS.AGENTS_PUBLISH)
  const readiness = useQuery(agentQueries.readiness(orgId, agent.id))
  const live = useQuery({
    ...agentQueries.liveVersion(orgId, agent.id, agent.liveVersion ?? 0),
    enabled: agent.liveVersion !== null,
  })
  const publish = usePublishAgentMutation(orgId, agent.id, { silent: true })
  const [notes, setNotes] = useState('')
  const [wantsApi, setWantsApi] = useState(false)
  const [failure, setFailure] = useState<{ error: unknown } | { notSaved: true } | null>(null)

  // The check reads the saved draft: save what is pending, then read it again
  useEffect(() => {
    void onFlush().then(() =>
      queryClient.invalidateQueries({ queryKey: agentKeys.readiness(orgId, agent.id) }),
    )
  }, [onFlush, queryClient, orgId, agent.id])

  const hasApi = agent.channels.some((channel) => channel.type === 'api')
  const changes = live.data
    ? diffAgentDefinitions(live.data.definition, toSaveableDefinition(definition))
    : null
  const isFirst = agent.liveVersion === null
  const hasNothingToPublish =
    !isFirst && changes !== null && changes.length === 0 && !(wantsApi && !hasApi)

  const blockingCount =
    readiness.data?.items.filter((item) => item.severity === 'blocking' && !item.passed).length ?? 0
  const canChange = !isReadOnly && canPublish
  const reason = getBlockedReason({
    canChange,
    saveKind: saveStatus.kind,
    isReadinessUnknown: readiness.error !== null,
    blockingCount,
    hasNothingToPublish,
  })

  const onPublish = async () => {
    setFailure(null)
    const revision = await onFlush()
    if (revision === null) {
      setFailure({ notSaved: true })
      return
    }
    try {
      const result = await publish.mutateAsync({
        baseRevision: revision,
        notes: notes.trim() === '' ? undefined : notes.trim(),
        channels: wantsApi && !hasApi ? [{ type: 'api' }] : [],
      })
      // the publish moved the draft's revision; the agent was read again
      const detail = queryClient.getQueryData<AgentDetailDto>(agentKeys.detail(orgId, agent.id))
      if (detail) onPublished(detail.draft.revision)
      setNotes('')
      setWantsApi(false)
      toast.success(t('published', { version: result.version.version }))
      if (result.channels.some((channel) => channel.status === 'pending_approval')) {
        toast.info(t('waitingForAdmin'))
      }
    } catch (error) {
      if (isApiError(error) && error.code === ERROR_CODES.AGENT_EDIT_CONFLICT) {
        await onConflict(error)
        return
      }
      if (isApiError(error) && error.code === ERROR_CODES.AGENT_NOT_READY) {
        void queryClient.invalidateQueries({ queryKey: agentKeys.readiness(orgId, agent.id) })
      }
      setFailure({ error })
    }
  }

  let failureMessage: string | null = null
  if (failure) {
    failureMessage =
      'notSaved' in failure ? t('failure.notSaved') : getErrorMessage(failure.error, tErrors)
  }

  return {
    t,
    readiness: {
      data: readiness.data,
      isLoading: readiness.isPending,
      errorMessage: readiness.error ? getErrorMessage(readiness.error, tErrors) : null,
      errorReference: isApiError(readiness.error) ? readiness.error.requestId : undefined,
      refetch: () => void readiness.refetch(),
    },
    tabHref: (tab: AgentReadinessItemDto['tab']) => ROUTES.workspace.agent(orgSlug, agent.id, tab),
    changes,
    liveVersion: agent.liveVersion,
    notes,
    onNotesChange: setNotes,
    wantsApi,
    onWantsApiChange: setWantsApi,
    canChange,
    blockedReason: reason && t(`blocked.${reason}`, { count: blockingCount }),
    isPublishing: publish.isPending || saveStatus.kind === 'saving',
    publishLabel: t('action', { version: (agent.liveVersion ?? 0) + 1 }),
    failureMessage,
    onPublish: () => void onPublish(),
  }
}
