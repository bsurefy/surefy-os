// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { Field, SliderInput } from '@surefy/ui/components/Forms'
import { FormField } from '@surefy/ui/primitives/form'

import type { FieldsProps } from './fields.types'

/** Thresholds for these actions; the stricter of this and the defaults applies. */
export default function ThresholdOverrideFields({ control, isReadOnly }: Readonly<FieldsProps>) {
  const t = useTranslations('guard.guardrails.sheet.override')
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-section-title text-foreground mb-1">{t('title')}</legend>
      <p className="text-body text-foreground-secondary">{t('help')}</p>
      <FormField
        control={control}
        name="autoPercent"
        render={({ field, fieldState }) => (
          <Field label={t('auto')} error={fieldState.error?.message}>
            <SliderInput
              label={t('auto')}
              value={field.value}
              min={1}
              max={100}
              suffix="%"
              isDisabled={isReadOnly}
              onValueChange={field.onChange}
            />
          </Field>
        )}
      />
      <FormField
        control={control}
        name="reviewPercent"
        render={({ field, fieldState }) => (
          <Field label={t('review')} error={fieldState.error?.message}>
            <SliderInput
              label={t('review')}
              value={field.value}
              min={0}
              max={99}
              suffix="%"
              isDisabled={isReadOnly}
              onValueChange={field.onChange}
            />
          </Field>
        )}
      />
    </fieldset>
  )
}
