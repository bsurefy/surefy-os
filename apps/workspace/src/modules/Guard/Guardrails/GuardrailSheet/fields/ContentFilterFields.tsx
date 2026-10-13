// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { CONTENT_FILTER_ACTIONS } from '@surefy/contracts'
import { Field, MultiSelect, SelectInput } from '@surefy/ui/components/Forms'
import { FormField } from '@surefy/ui/primitives/form'

import { CONTENT_CATEGORIES } from '../../Guardrails.constants'

import type { FieldsProps } from './fields.types'

/** The categories a content filter looks for and what it does with a hit. */
export default function ContentFilterFields({
  control,
  selected,
  isReadOnly,
}: Readonly<FieldsProps & { selected: readonly string[] }>) {
  const t = useTranslations('guard.guardrails.sheet.content')
  const known: readonly string[] = CONTENT_CATEGORIES
  // a rule may carry a category this screen does not list: keep it selectable
  const categories = [...CONTENT_CATEGORIES, ...selected.filter((value) => !known.includes(value))]
  const label = (value: string) => (known.includes(value) ? t(`labels.${value}`) : value)

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-section-title text-foreground mb-1">{t('title')}</legend>
      <FormField
        control={control}
        name="categories"
        render={({ field, fieldState }) => (
          <Field label={t('categories')} error={fieldState.error?.message}>
            <MultiSelect
              options={categories.map((value) => ({ value, label: label(value) }))}
              labels={{
                placeholder: t('categoriesPlaceholder'),
                search: t('categoriesSearch'),
                empty: t('categoriesEmpty'),
                remove: (name: string) => t('removeCategory', { name }),
                more: (count: number) => `+${count}`,
              }}
              value={field.value}
              onValueChange={field.onChange}
              isDisabled={isReadOnly}
            />
          </Field>
        )}
      />
      <FormField
        control={control}
        name="filterAction"
        render={({ field }) => (
          <Field label={t('action')}>
            <SelectInput
              options={CONTENT_FILTER_ACTIONS.map((value) => ({
                value,
                label: t(`actions.${value}`),
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
