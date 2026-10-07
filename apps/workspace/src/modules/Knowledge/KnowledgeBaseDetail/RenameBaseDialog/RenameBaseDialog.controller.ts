// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'

import { useUpdateKnowledgeBaseMutation } from '@/api/knowledge'
import { ERROR_CODES } from '@surefy/contracts'
import type { KnowledgeBaseDto } from '@surefy/contracts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { renameBaseFormSchema } from '../../Knowledge.schema'

import type { BaseSyntheticEvent } from 'react'

/** A taken name belongs on the name field; anything else is shown above the buttons. */
export function useRenameBaseController({
  orgId,
  base,
  onClose,
}: {
  orgId: string
  base: KnowledgeBaseDto
  onClose: () => void
}) {
  const t = useTranslations('knowledge.detail.rename')
  const tErrors = useTranslations('errors')
  const update = useUpdateKnowledgeBaseMutation(orgId, base.id, { silent: true })
  const form = useForm({
    schema: renameBaseFormSchema,
    defaultValues: { name: base.name, description: base.description ?? '' },
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ name: values.name, description: values.description || null })
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      const message = getErrorMessage(error, tErrors)
      form.setError(error.code === ERROR_CODES.KNOWLEDGE_NAME_TAKEN ? 'name' : 'root', { message })
    }
  })

  return {
    t,
    form,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
