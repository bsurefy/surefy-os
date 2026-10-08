// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useLocale, useTranslations } from 'next-intl'

import { ACTION_LIMIT_REACHED_ACTIONS } from '@surefy/contracts'
import { Field, NumberInput, SelectInput } from '@surefy/ui/components/Forms'
import { FormField } from '@surefy/ui/primitives/form'

import { getCurrencySymbol } from '../../../Guard.utils'

import type { FieldsProps } from './fields.types'

/** Business limits and what happens when one is reached. */
export default function ActionLimitFields({
  control,
  currency,
  isReadOnly,
}: Readonly<FieldsProps & { currency: string }>) {
  const t = useTranslations('guard.guardrails.sheet.limit')
  const locale = useLocale()
  const symbol = getCurrencySymbol(currency, locale)
  const money = { prefix: symbol, formatOptions: { maximumFractionDigits: 2 } }

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-section-title text-foreground mb-1">{t('title')}</legend>
      <p className="text-body text-foreground-secondary">{t('help')}</p>
      <FormField
        control={control}
        name="perActionAmount"
        render={({ field, fieldState }) => (
          <Field label={t('perAction')} error={fieldState.error?.message}>
            <NumberInput
              value={field.value}
              onValueChange={field.onChange}
              min={0}
              disabled={isReadOnly}
              {...money}
            />
          </Field>
        )}
      />
      <FormField
        control={control}
        name="perDayCount"
        render={({ field, fieldState }) => (
          <Field label={t('perDayCount')} error={fieldState.error?.message}>
            <NumberInput
              value={field.value}
              onValueChange={field.onChange}
              min={1}
              disabled={isReadOnly}
            />
          </Field>
        )}
      />
      <FormField
        control={control}
        name="perDayAmount"
        render={({ field, fieldState }) => (
          <Field label={t('perDayAmount')} error={fieldState.error?.message}>
            <NumberInput
              value={field.value}
              onValueChange={field.onChange}
              min={0}
              disabled={isReadOnly}
              {...money}
            />
          </Field>
        )}
      />
      <FormField
        control={control}
        name="onReached"
        render={({ field }) => (
          <Field label={t('onReached')}>
            <SelectInput
              options={ACTION_LIMIT_REACHED_ACTIONS.map((value) => ({
                value,
                label: t(`reached.${value}`),
              }))}
              value={field.value}
              onValueChange={field.onChange}
              isDisabled={isReadOnly}
            />
          </Field>
        )}
      />
    </fieldset>
  )
}
