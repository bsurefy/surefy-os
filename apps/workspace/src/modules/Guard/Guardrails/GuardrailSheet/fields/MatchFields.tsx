// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useFieldArray } from 'react-hook-form'

import { GUARD_CONDITION_OPERATORS, GUARD_CONDITIONS_MAX } from '@surefy/contracts'
import { Field, SelectInput } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { FormField } from '@surefy/ui/primitives/form'
import { Input } from '@surefy/ui/primitives/input'

import type { FieldsProps } from './fields.types'

/** Which actions a rule covers: the action, narrowed by conditions on the action's input. */
export default function MatchFields({ control, isReadOnly }: Readonly<FieldsProps>) {
  const t = useTranslations('guard.guardrails.sheet.match')
  const conditions = useFieldArray({ control, name: 'conditions' })

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-section-title text-foreground mb-1">{t('title')}</legend>
      <FormField
        control={control}
        name="action"
        render={({ field, fieldState }) => (
          <Field
            label={t('action')}
            description={t('actionHelp')}
            error={fieldState.error?.message}
          >
            <Input autoComplete="off" spellCheck={false} disabled={isReadOnly} {...field} />
          </Field>
        )}
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-label text-foreground">{t('conditions')}</span>
          <span className="text-body text-foreground-secondary">{t('conditionsHelp')}</span>
        </div>
        {conditions.fields.map((item, index) => (
          <div
            key={item.id}
            className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <FormField
              control={control}
              name={`conditions.${index}.field`}
              render={({ field, fieldState }) => (
                <Field
                  label={t('field')}
                  error={fieldState.error ? t('conditionInvalid') : undefined}
                >
                  <Input autoComplete="off" spellCheck={false} disabled={isReadOnly} {...field} />
                </Field>
              )}
            />
            <FormField
              control={control}
              name={`conditions.${index}.operator`}
              render={({ field }) => (
                <Field label={t('operator')}>
                  <SelectInput
                    options={GUARD_CONDITION_OPERATORS.map((value) => ({
                      value,
                      label: t(`operators.${value}`),
                    }))}
                    value={field.value}
                    onValueChange={field.onChange}
                    isDisabled={isReadOnly}
                  />
                </Field>
              )}
            />
            <FormField
              control={control}
              name={`conditions.${index}.value`}
              render={({ field, fieldState }) => (
                <Field
                  label={t('value')}
                  error={fieldState.error ? t('conditionInvalid') : undefined}
                >
                  <Input autoComplete="off" disabled={isReadOnly} {...field} />
                </Field>
              )}
            />
            {!isReadOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mt-7"
                aria-label={t('removeCondition', { index: index + 1 })}
                onClick={() => {
                  conditions.remove(index)
                }}
              >
                <X aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {conditions.fields.length > 0 && (
          <p className="text-caption text-muted-foreground">{t('valueHelp')}</p>
        )}
        {!isReadOnly && conditions.fields.length < GUARD_CONDITIONS_MAX && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={Plus}
            className="self-start"
            onClick={() => {
              conditions.append({ field: '', operator: 'gt', value: '' })
            }}
          >
            {t('addCondition')}
          </Button>
        )}
      </div>
    </fieldset>
  )
}
