// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { WIDGET_ORIGINS_MAX, WIDGET_POSITIONS, WIDGET_THEMES } from '@surefy/contracts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { createWidgetFormSchema, toWidgetConfig, widgetToValues } from './WidgetChannel.schema'

import type { WidgetDialogProps } from './WidgetChannel.types'
import type { BaseSyntheticEvent } from 'react'

/** The widget's settings: allowed websites, greeting, theme and corner. */
export function useWidgetDialogController({
  config,
  onSave,
  onClose,
}: Pick<WidgetDialogProps, 'config' | 'onSave' | 'onClose'>) {
  const t = useTranslations('agents.editor.publish.channels.widget.dialog')
  const tErrors = useTranslations('errors')
  const [schema] = useState(() =>
    createWidgetFormSchema({
      originsRequired: t('origins.required'),
      originsInvalid: (addresses) => t('origins.invalid', { addresses }),
      originsTooMany: t('origins.tooMany', { count: WIDGET_ORIGINS_MAX }),
      greeting: t('greeting.tooLong'),
    }),
  )
  const form = useForm({ schema, defaultValues: widgetToValues(config) })

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(toWidgetConfig(values))
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
    themeOptions: WIDGET_THEMES.map((value) => ({ value, label: t(`theme.${value}`) })),
    positionOptions: WIDGET_POSITIONS.map((value) => ({ value, label: t(`position.${value}`) })),
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
