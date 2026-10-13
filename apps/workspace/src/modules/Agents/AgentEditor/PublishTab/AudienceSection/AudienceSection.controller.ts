// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { agentQueries, useReplaceAgentAccessMutation } from '@/api/agents'
import { memberQueries } from '@/api/members'
import { teamQueries } from '@/api/teams'
import type { AgentAccessEntryDto, AgentAccessInput, AgentAccessLevel } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { AUDIENCE_LOOKUP_LIMIT, ORGANIZATION_KEY } from './AudienceSection.constants'

import type { AudienceRow, AudienceSectionProps } from './AudienceSection.types'

const rowKey = (entry: AgentAccessEntryDto) => {
  if (entry.subjectType === 'team') return `team:${entry.team?.id ?? ''}`
  if (entry.subjectType === 'user') return `user:${entry.user?.id ?? ''}`
  return ORGANIZATION_KEY
}

/** The entries as `PUT …/access` takes them, with one level changed. */
function toInput(entries: readonly AgentAccessEntryDto[]): AgentAccessInput {
  return entries.flatMap((entry): AgentAccessInput => {
    if (entry.subjectType === 'team' && entry.team) {
      return [{ subjectType: 'team', teamId: entry.team.id, level: entry.level }]
    }
    if (entry.subjectType === 'user' && entry.user) {
      return [{ subjectType: 'user', userId: entry.user.id, level: entry.level }]
    }
    return entry.subjectType === 'organization'
      ? [{ subjectType: 'organization', level: 'use' }]
      : []
  })
}

/** The entry a picker value stands for (`team:<id>`, `user:<id>` or everyone), who can use it. */
function toAddedEntry(value: string): AgentAccessInput {
  const [type, id] = value.split(':')
  if (type === 'team' && id) return [{ subjectType: 'team', teamId: id, level: 'use' }]
  if (type === 'user' && id) return [{ subjectType: 'user', userId: id, level: 'use' }]
  return [{ subjectType: 'organization', level: 'use' }]
}

/**
 * Who can use the agent: everyone, teams and people, each able to use it or to edit it. A change is
 * saved at once, because the audience is live metadata and not part of a version; the owner and
 * Admins always have access without a row.
 */
export function useAudienceSectionController({ agent, isReadOnly }: AudienceSectionProps) {
  const t = useTranslations('agents.editor.publish.audience')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const access = useQuery(agentQueries.access(orgId, agent.id))
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: AUDIENCE_LOOKUP_LIMIT }))
  // Builders may not read the member list: the picker then offers teams and everyone
  const people = useInfiniteQuery(
    memberQueries.list(orgId, { status: 'active', limit: AUDIENCE_LOOKUP_LIMIT }),
  )
  const replace = useReplaceAgentAccessMutation(orgId, agent.id, { silent: true })

  const entries = access.data?.entries ?? []
  const rows: AudienceRow[] = entries.map((entry) => {
    const key = rowKey(entry)
    if (entry.subjectType === 'team') {
      return { key, kind: 'team', label: entry.team?.name ?? t('unknownTeam'), level: entry.level }
    }
    if (entry.subjectType === 'user') {
      return {
        key,
        kind: 'user',
        label: entry.user?.name ?? t('unknownPerson'),
        description: entry.user?.email,
        level: entry.level,
      }
    }
    return { key, kind: 'organization', label: t('everyone'), level: entry.level }
  })

  const taken = new Set(rows.map((row) => row.key))
  const addOptions = [
    { value: ORGANIZATION_KEY, label: t('everyone'), description: t('everyoneHelp') },
    ...(teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
      value: `team:${team.id}`,
      label: team.name,
      description: t('teamOption'),
    })),
    ...(people.data?.pages.flatMap((page) => page.items) ?? []).map((member) => ({
      value: `user:${member.user.id}`,
      label: member.user.name,
      description: member.user.email,
    })),
  ].filter((option) => !taken.has(option.value))

  const save = (next: AgentAccessInput) => {
    if (isReadOnly) return
    replace.reset()
    replace.mutate({ entries: next })
  }

  const changeLevel = (key: string, level: AgentAccessLevel) => {
    save(toInput(entries.map((entry) => (rowKey(entry) === key ? { ...entry, level } : entry))))
  }

  return {
    t,
    isLoading: access.isPending,
    loadError: access.error ? getErrorMessage(access.error, tErrors) : null,
    loadReference: isApiError(access.error) ? access.error.requestId : undefined,
    refetch: () => void access.refetch(),
    saveError: replace.error ? getErrorMessage(replace.error, tErrors) : null,
    isSaving: replace.isPending,
    rows,
    addOptions,
    isReadOnly,
    onAdd: (value: string | null) => {
      if (value === null) return
      save([...toInput(entries), ...toAddedEntry(value)])
    },
    onRemove: (key: string) => {
      save(toInput(entries.filter((entry) => rowKey(entry) !== key)))
    },
    onLevelChange: changeLevel,
  }
}
