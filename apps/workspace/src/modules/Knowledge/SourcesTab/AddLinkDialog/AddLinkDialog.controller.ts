// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'

import { useCreateKnowledgeLinkMutation } from '@/api/knowledge'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { linkFormSchema } from '../../Knowledge.schema'

import type { LinkFormValues } from '../../Knowledge.schema'
import type { BaseSyntheticEvent } from 'react'

/** One path rule per line: blanks are dropped and each line is trimmed. */
export function parsePathRules(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Add link: the address and crawl settings; a failure is shown above the buttons, a bad address on its field. */
export function useAddLinkController({
  orgId,
  baseId,
  onClose,
}: {
  orgId: string
  baseId: string
  onClose: () => void
}) {
  const t = useTranslations('knowledge.detail.sources.link')
  const tErrors = useTranslations('errors')
  const create = useCreateKnowledgeLinkMutation(orgId, baseId, { silent: true })
  const form = useForm({
    schema: linkFormSchema,
    defaultValues: {
      url: '',
      name: '',
      crawlDepth: 0,
      includePaths: '',
      excludePaths: '',
      refresh: 'off',
    } satisfies LinkFormValues,
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync({
        url: values.url,
        name: values.name || undefined,
        crawlDepth: values.crawlDepth,
        includePaths: parsePathRules(values.includePaths),
        excludePaths: parsePathRules(values.excludePaths),
        refresh: values.refresh,
      })
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('root', { message: getErrorMessage(error, tErrors) })
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
