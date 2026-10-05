// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { useCreateKnowledgeBaseMutation } from '@/api/knowledge'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { ERROR_CODES } from '@surefy/contracts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { useTeamOptions } from '../../Knowledge.hooks'
import { knowledgeBaseFormSchema } from '../../Knowledge.schema'

import type { KnowledgeBaseFormValues } from '../../Knowledge.schema'
import type { BaseSyntheticEvent } from 'react'

/** A taken name belongs on the name field, a missing local model on the switch; anything else above the buttons. */
export function useCreateKnowledgeBaseController({ orgId }: { orgId: string }) {
  const t = useTranslations('knowledge.library.create')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const create = useCreateKnowledgeBaseMutation(orgId, { silent: true })
  const { options: teamOptions } = useTeamOptions()
  const form = useForm({
    schema: knowledgeBaseFormSchema,
    defaultValues: {
      name: '',
      description: '',
      isLocalOnly: false,
      teamIds: [],
    } satisfies KnowledgeBaseFormValues,
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      const created = await create.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        isLocalOnly: values.isLocalOnly,
        chunkingPreset: 'default',
        teamIds: values.teamIds,
      })
      router.push(toRoute(ROUTES.workspace.knowledgeBase(orgSlug, created.id)))
    } catch (error) {
      if (!isApiError(error)) throw error
      const message = getErrorMessage(error, tErrors)
      if (error.code === ERROR_CODES.KNOWLEDGE_NAME_TAKEN) form.setError('name', { message })
      else if (error.code === ERROR_CODES.KNOWLEDGE_LOCAL_EMBEDDING_REQUIRED) {
        form.setError('isLocalOnly', { message })
      } else form.setError('root', { message })
    }
  })

  return {
    t,
    form,
    teamOptions,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
