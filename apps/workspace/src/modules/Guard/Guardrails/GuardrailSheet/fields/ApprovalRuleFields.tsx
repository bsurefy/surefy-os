// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { APPROVAL_RISKS, APPROVAL_TIMEOUT_ACTIONS } from '@surefy/contracts'
import {
  Field,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  SelectInput,
  SwitchField,
} from '@surefy/ui/components/Forms'
import { FormField } from '@surefy/ui/primitives/form'

import { WAIT_UNITS } from '../../Guardrails.constants'
import { useApproverOptions } from '../GuardrailSheet.hooks'

import type { FieldsProps } from './fields.types'

/** Who decides, how long they have and what happens when nobody answers. */
export default function ApprovalRuleFields({
  control,
  waits,
  onTimeout,
  isReadOnly,
}: Readonly<FieldsProps & { waits: boolean; onTimeout: string }>) {
  const t = useTranslations('guard.guardrails.sheet.approval')
  const approvers = useApproverOptions()
  const pickerLabels = {
    placeholder: t('approversPlaceholder'),
    search: t('approversSearch'),
    empty: t('approversEmpty'),
    loading: t('approversLoading'),
    remove: (label: string) => t('removeApprover', { name: label }),
    more: (count: number) => t('moreApprovers', { count }),
  }

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-section-title text-foreground mb-1">{t('title')}</legend>
      <FormField
        control={control}
        name="approvers"
        render={({ field, fieldState }) => (
          <Field
            label={t('approvers')}
            description={t('approversHelp')}
            error={fieldState.error?.message}
          >
            <MultiSelect
              options={approvers.options}
              labels={pickerLabels}
              value={field.value}
              onValueChange={field.onChange}
              isLoading={approvers.isLoading}
              isDisabled={isReadOnly}
            />
          </Field>
        )}
      />
      <FormField
        control={control}
        name="waits"
        render={({ field }) => (
          <SwitchField
            label={t('waits')}
            description={t('waitsHelp')}
            checked={field.value}
            onCheckedChange={field.onChange}
            disabled={isReadOnly}
          />
        )}
      />
      {waits && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={control}
              name="waitAmount"
              render={({ field, fieldState }) => (
                <Field label={t('waitAmount')} error={fieldState.error?.message}>
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
              name="waitUnit"
              render={({ field }) => (
                <Field label={t('waitUnit')}>
                  <SelectInput
                    options={WAIT_UNITS.map((value) => ({ value, label: t(`units.${value}`) }))}
                    value={field.value}
                    onValueChange={field.onChange}
                    isDisabled={isReadOnly}
                  />
                </Field>
              )}
            />
          </div>
          <FormField
            control={control}
            name="onTimeout"
            render={({ field }) => (
              <Field label={t('onTimeout')}>
                <SelectInput
                  options={APPROVAL_TIMEOUT_ACTIONS.map((value) => ({
                    value,
                    label: t(`timeouts.${value}`),
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                  isDisabled={isReadOnly}
                />
              </Field>
            )}
          />
          {onTimeout === 'escalate' && (
            <FormField
              control={control}
              name="escalateTo"
              render={({ field, fieldState }) => (
                <Field label={t('escalateTo')} error={fieldState.error?.message}>
                  <MultiSelect
                    options={approvers.options}
                    labels={pickerLabels}
                    value={field.value}
                    onValueChange={field.onChange}
                    isLoading={approvers.isLoading}
                    isDisabled={isReadOnly}
                  />
                </Field>
              )}
            />
          )}
        </>
      )}
      <FormField
        control={control}
        name="risk"
        render={({ field }) => (
          <Field label={t('risk')}>
            <SegmentedControl
              label={t('risk')}
              options={APPROVAL_RISKS.map((value) => ({
                value,
                label: t(`risks.${value}`),
                isDisabled: isReadOnly,
              }))}
              value={field.value}
              onValueChange={field.onChange}
            />
          </Field>
        )}
      />
    </fieldset>
  )
}
