// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'

import { ERROR_CODES } from '@surefy/contracts'
import type { DataFilterTypeDto, PiiAction } from '@surefy/contracts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { createCustomTypeSchema } from '../DataFilters.schema'

import type { BaseSyntheticEvent } from 'react'

interface Params {
  /** The custom type being edited; null when adding one. */
  line: DataFilterTypeDto | null
  onSave: (input: { label: string; pattern: string; action: PiiAction }) => Promise<unknown>
}

/** The custom type form: a name, the pattern that finds it and its action. */
export function useCustomTypeDialogController({ line, onSave }: Params) {
  const t = useTranslations('guard.dataFilters.customDialog')
  const tActions = useTranslations('guard.dataFilters.actions')
  const tErrors = useTranslations('errors')
  const form = useForm({
    schema: createCustomTypeSchema({ label: t('labelRequired'), pattern: t('patternRequired') }),
    defaultValues: {
      label: line?.customLabel ?? '',
      pattern: line?.customPattern ?? '',
      action: line?.action ?? 'mask',
    },
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(values)
    } catch (error) {
      if (!isApiError(error)) throw error
      // a pattern the service refuses belongs on the pattern
      const field = error.code === ERROR_CODES.GUARD_PII_PATTERN_INVALID ? 'pattern' : 'root'
      form.setError(field, { message: getErrorMessage(error, tErrors) })
    }
  })

  return {
    t,
    tActions,
    form,
    isEditing: line !== null,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
