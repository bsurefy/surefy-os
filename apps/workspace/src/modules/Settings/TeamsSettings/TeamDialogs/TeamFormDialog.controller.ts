// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'

import { useCreateTeamMutation, useUpdateTeamMutation } from '@/api/teams'
import { ERROR_CODES } from '@surefy/contracts'
import type { TeamDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { teamFormSchema } from '../TeamsSettings.schema'

import type { TeamFormValues } from '../TeamsSettings.schema'
import type { BaseSyntheticEvent } from 'react'

/** A taken name belongs on the name field; anything else is shown above the buttons. */
export function useTeamFormController({
  orgId,
  team,
  onClose,
}: {
  orgId: string
  team?: TeamDto
  onClose: () => void
}) {
  const t = useTranslations('settings.teams.form')
  const tErrors = useTranslations('errors')
  const create = useCreateTeamMutation(orgId, { silent: true })
  const update = useUpdateTeamMutation(orgId, { silent: true })
  const form = useForm({
    schema: teamFormSchema,
    defaultValues: {
      name: team?.name ?? '',
      description: team?.description ?? '',
    } satisfies TeamFormValues,
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      if (team) {
        await update.mutateAsync({
          teamId: team.id,
          name: values.name,
          description: values.description || null,
        })
        toast.success(t('saved', { name: values.name }))
      } else {
        await create.mutateAsync({
          name: values.name,
          description: values.description || undefined,
          memberUserIds: [],
        })
        toast.success(t('created', { name: values.name }))
      }
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      const message = getErrorMessage(error, tErrors)
      form.setError(error.code === ERROR_CODES.TEAM_NAME_TAKEN ? 'name' : 'root', { message })
    }
  })

  return {
    form,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
