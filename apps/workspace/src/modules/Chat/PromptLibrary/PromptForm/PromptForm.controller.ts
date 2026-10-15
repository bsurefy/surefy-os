// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { useCreatePromptMutation, useUpdatePromptMutation } from '@/api/prompts'
import { teamQueries } from '@/api/teams'
import { PAGE_SIZE, parsePromptVariables } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { promptFormSchema } from '../PromptLibrary.schema'

import type { PromptFormTarget } from '../PromptLibrary.controller'
import type { BaseSyntheticEvent } from 'react'

export interface PromptFormProps {
  orgId: string
  target: PromptFormTarget
  /** Without `prompts:manage-shared` a prompt stays personal. */
  canManageShared: boolean
  onClose: () => void
}

/** Create or change a prompt: title, text with `{variables}`, and for Builders who it is shared with. */
export function usePromptFormController({
  orgId,
  target,
  canManageShared,
  onClose,
}: PromptFormProps) {
  const t = useTranslations('chat.prompts.form')
  const tErrors = useTranslations('errors')
  const create = useCreatePromptMutation(orgId, { silent: true })
  const update = useUpdatePromptMutation(orgId, { silent: true })
  const prompt = target.mode === 'edit' ? target.prompt : null
  const form = useForm({
    schema: promptFormSchema,
    defaultValues: {
      title: prompt?.title ?? '',
      body: prompt?.body ?? '',
      visibility: prompt?.visibility ?? 'personal',
      teamIds: prompt?.teams.map((team) => team.id) ?? [],
    },
  })
  const visibility = form.watch('visibility')
  const body = form.watch('body')
  const teams = useInfiniteQuery({
    ...teamQueries.list(orgId, { sort: 'name', limit: PAGE_SIZE.max }),
    enabled: canManageShared && visibility === 'shared',
  })

  const submit = form.handleSubmit(async (values) => {
    const input = {
      ...values,
      // a personal prompt belongs to nobody's team
      teamIds: values.visibility === 'shared' ? values.teamIds : [],
    }
    try {
      if (prompt) await update.mutateAsync({ promptId: prompt.id, ...input })
      else await create.mutateAsync(input)
      toast.success(t(prompt ? 'saved' : 'created'))
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  return {
    t,
    form,
    isEdit: prompt !== null,
    variables: parsePromptVariables(body),
    isShared: visibility === 'shared',
    teamOptions: (teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
      value: team.id,
      label: team.name,
    })),
    isLoadingTeams: teams.isPending && visibility === 'shared',
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
