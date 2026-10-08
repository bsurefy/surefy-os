// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { teamQueries } from '@/api/teams'
import type { PiiAction } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { TEAM_LOOKUP_LIMIT } from '../DataFilters.constants'
import { createExceptionSchema } from '../DataFilters.schema'

import type { BaseSyntheticEvent } from 'react'

interface Params {
  /** The organization's action for the type: the exception starts from it. */
  currentAction: PiiAction
  onAdd: (input: {
    teamId: string
    action: PiiAction
    reason: string
    teamName: string
  }) => Promise<unknown>
}

/** The exception form: a team, the action for it, and the reason that goes to the audit log. */
export function useExceptionDialogController({ currentAction, onAdd }: Params) {
  const t = useTranslations('guard.dataFilters.exceptionDialog')
  const tActions = useTranslations('guard.dataFilters.actions')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const teams = useInfiniteQuery(teamQueries.list(orgId, { limit: TEAM_LOOKUP_LIMIT }))
  const teamList = teams.data?.pages.flatMap((page) => page.items) ?? []
  const form = useForm({
    schema: createExceptionSchema({ team: t('teamRequired'), reason: t('reasonRequired') }),
    defaultValues: { teamId: '', action: currentAction, reason: '' },
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      await onAdd({
        ...values,
        teamName: teamList.find((team) => team.id === values.teamId)?.name ?? '',
      })
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  return {
    t,
    tActions,
    form,
    teamOptions: teamList.map((team) => ({ value: team.id, label: team.name })),
    isLoadingTeams: teams.isPending,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
