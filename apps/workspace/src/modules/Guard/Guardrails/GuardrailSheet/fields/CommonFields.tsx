// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { GUARDRAIL_SCOPES } from '@surefy/contracts'
import type { GuardrailType } from '@surefy/contracts'
import {
  Combobox,
  Field,
  SegmentedControl,
  SelectInput,
  SwitchField,
} from '@surefy/ui/components/Forms'
import { FormField } from '@surefy/ui/primitives/form'
import { Input } from '@surefy/ui/primitives/input'

import { ADDABLE_TYPES } from '../../Guardrails.constants'
import { useTeamOptions } from '../GuardrailSheet.hooks'

import type { FieldsProps } from './fields.types'

/** Name, type (fixed once the rule exists), scope with its team, and the on/off switch. */
export default function CommonFields({
  control,
  scope,
  isNew,
  isReadOnly,
}: Readonly<FieldsProps & { scope: string; isNew: boolean }>) {
  const t = useTranslations('guard.guardrails.sheet')
  const tGuardrails = useTranslations('guard.guardrails')
  const teams = useTeamOptions()

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Field label={t('name')} error={fieldState.error?.message}>
            <Input autoComplete="off" disabled={isReadOnly} {...field} />
          </Field>
        )}
      />
      <FormField
        control={control}
        name="type"
        render={({ field }) => (
          <Field label={t('type')} description={isNew ? undefined : t('typeFixed')}>
            <SelectInput
              options={ADDABLE_TYPES.map((value: GuardrailType) => ({
                value,
                label: tGuardrails(`types.${value}`),
              }))}
              value={field.value}
              onValueChange={field.onChange}
              isDisabled={!isNew || isReadOnly}
            />
          </Field>
        )}
      />
      {isNew && (
        <FormField
          control={control}
          name="type"
          render={({ field }) => (
            <p className="text-caption text-muted-foreground -mt-2">
              {tGuardrails(`typeHelp.${field.value}`)}
            </p>
          )}
        />
      )}
      <FormField
        control={control}
        name="scope"
        render={({ field }) => (
          <Field label={t('scope')}>
            <SegmentedControl
              label={t('scope')}
              options={GUARDRAIL_SCOPES.map((value) => ({
                value,
                label: t(`scopeOptions.${value}`),
                isDisabled: !isNew || isReadOnly,
              }))}
              value={field.value}
              onValueChange={field.onChange}
            />
          </Field>
        )}
      />
      {scope === 'team' && (
        <FormField
          control={control}
          name="teamId"
          render={({ field, fieldState }) => (
            <Field label={t('team')} error={fieldState.error?.message}>
              <Combobox
                options={teams.options}
                value={field.value}
                onValueChange={field.onChange}
                isLoading={teams.isLoading}
                isDisabled={!isNew || isReadOnly}
                labels={{
                  placeholder: t('teamPlaceholder'),
                  search: t('teamSearch'),
                  empty: t('teamEmpty'),
                }}
              />
            </Field>
          )}
        />
      )}
      <FormField
        control={control}
        name="isEnabled"
        render={({ field }) => (
          <SwitchField
            label={t('enabled')}
            description={t('enabledHelp')}
            checked={field.value}
            onCheckedChange={field.onChange}
            disabled={isReadOnly}
          />
        )}
      />
    </div>
  )
}
