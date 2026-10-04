// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { debounce, parseAsString, useQueryState } from 'nuqs'
import { useState } from 'react'

import {
  modelQueries,
  useSetModelAccessMutation,
  useUpdateVaultSettingsMutation,
} from '@/api/models'
import type { ModelAccessEntryDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { ACCESS_SUBJECT, ACCESS_VIEW, KEYS_PAGE_SIZE } from '../Vault.constants'
import { useAccessSubjects } from '../Vault.hooks'
import { fromAccessValues, toAccessValues } from '../Vault.utils'

import type { RemoveAccessRequest } from '../ModelDialogs/RemoveAccessDialog'
import type { AccessView } from '../Vault.constants'

const SEARCH_DEBOUNCE_MS = 300

/** Teams shown as matrix columns; larger organizations use the list view. */
export const MATRIX_TEAMS_MAX = 8

/** Vault › Model access: the embedding model, and who may use each model (list and matrix). */
export function useModelAccessTabController() {
  const t = useTranslations('vault.modelAccess')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const subjects = useAccessSubjects()
  const [q, setQ] = useQueryState('q', parseAsString.withDefault(''))
  const [view, setView] = useState<AccessView>(ACCESS_VIEW.LIST)
  const [removal, setRemoval] = useState<RemoveAccessRequest | null>(null)

  const entries = useInfiniteQuery(
    modelQueries.access(orgId, { q: q || undefined, limit: KEYS_PAGE_SIZE }),
  )
  const embeddingModels = useInfiniteQuery(
    modelQueries.list(orgId, { type: 'embedding', isEnabled: true, limit: KEYS_PAGE_SIZE }),
  )
  const settings = useQuery(modelQueries.settings(orgId))
  const setAccess = useSetModelAccessMutation(orgId)
  const updateSettings = useUpdateVaultSettingsMutation(orgId)

  const subjectNames = new Map<string, string>([
    [ACCESS_SUBJECT.ORGANIZATION, t('everyone')],
    ...subjects.teams.map((team): [string, string] => [
      `${ACCESS_SUBJECT.TEAM_PREFIX}${team.id}`,
      team.name,
    ]),
    ...subjects.people.map((member): [string, string] => [
      `${ACCESS_SUBJECT.USER_PREFIX}${member.user.id}`,
      member.user.name,
    ]),
  ])

  const accessOptions = [
    { value: ACCESS_SUBJECT.ORGANIZATION, label: t('everyone'), description: t('everyoneHelp') },
    ...subjects.teams.map((team) => ({
      value: `${ACCESS_SUBJECT.TEAM_PREFIX}${team.id}`,
      label: team.name,
      description: t('team'),
    })),
    ...subjects.people.map((member) => ({
      value: `${ACCESS_SUBJECT.USER_PREFIX}${member.user.id}`,
      label: member.user.name,
      description: member.user.email,
    })),
  ]

  /** Granting is immediate; taking someone off a model asks first (T2) because they may be using it. */
  const changeAccess = (entry: ModelAccessEntryDto, next: string[]) => {
    const previous = toAccessValues(entry.rules)
    const removed = previous.filter((value) => !next.includes(value))
    const rules = fromAccessValues(next)
    if (removed.length === 0) {
      setAccess.mutate(
        { modelId: entry.modelId, rules },
        { onSuccess: () => toast.success(t('accessSaved', { model: entry.displayName })) },
      )
      return
    }
    const onlyTeam =
      removed.length === 1 && removed[0]?.startsWith(ACCESS_SUBJECT.TEAM_PREFIX)
        ? removed[0].slice(ACCESS_SUBJECT.TEAM_PREFIX.length)
        : undefined
    setRemoval({
      entry,
      rules,
      teamId: onlyTeam,
      subjectName: removed.map((value) => subjectNames.get(value) ?? value).join(', '),
    })
  }

  const embeddingList = embeddingModels.data?.pages.flatMap((page) => page.items) ?? []
  const entryList = entries.data?.pages.flatMap((page) => page.items) ?? []

  return {
    t,
    orgId,
    q,
    view,
    onViewChange: setView,
    entries: entryList,
    isLoading: entries.isPending || subjects.isLoading,
    errorMessage: entries.error ? getErrorMessage(entries.error, tErrors) : null,
    errorReference: isApiError(entries.error) ? entries.error.requestId : undefined,
    refetch: () => void entries.refetch(),
    hasMore: entries.hasNextPage,
    isLoadingMore: entries.isFetchingNextPage,
    onLoadMore: () => void entries.fetchNextPage(),
    onSearchChange: (value: string) =>
      void setQ(value || null, {
        limitUrlUpdates: debounce(SEARCH_DEBOUNCE_MS),
        history: 'replace',
      }),
    teams: subjects.teams.slice(0, MATRIX_TEAMS_MAX),
    hasMoreTeams: subjects.teams.length > MATRIX_TEAMS_MAX,
    accessOptions,
    changeAccess,
    removal,
    closeRemoval: () => {
      setRemoval(null)
    },
    embedding: {
      current: settings.data?.embeddingModel ?? null,
      isLoading: settings.isPending,
      options: embeddingList.map((model) => ({
        value: model.id,
        label: model.displayName,
        description: model.server ? model.server.name : model.providerKey,
      })),
      onChange: (modelId: string) => {
        updateSettings.mutate(
          { embeddingModelId: modelId },
          { onSuccess: () => toast.success(t('embedding.saved')) },
        )
      },
      isSaving: updateSettings.isPending,
    },
  }
}
