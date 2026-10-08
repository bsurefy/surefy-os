// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useLocale, useTranslations } from 'next-intl'

import { GUARD_QUICK_APPROVE_RISKS } from '@surefy/contracts'
import {
  Field,
  NumberInput,
  SegmentedControl,
  SelectInput,
  SwitchField,
} from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { FormField } from '@surefy/ui/primitives/form'

import { getCurrencySymbol } from '../../Guard.utils'
import { TARGET_UNITS } from '../GuardDefaults.constants'

import type { GuardDefaultsValues } from '../GuardDefaults.schema'
import type { Control } from 'react-hook-form'

interface ApprovalSettingsSectionProps {
  control: Control<GuardDefaultsValues>
  currency: string
  isStepUpEnabled: boolean
  isReadOnly: boolean
}

/** Quick-approve limit, step-up amount and the target time to decide. */
export default function ApprovalSettingsSection({
  control,
  currency,
  isStepUpEnabled,
  isReadOnly,
}: Readonly<ApprovalSettingsSectionProps>) {
  const t = useTranslations('guard.defaults.approvals')
  const locale = useLocale()
  const symbol = getCurrencySymbol(currency, locale)

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-label text-foreground">{t('quick.legend')}</legend>
          <p className="text-body text-foreground-secondary">{t('quick.help')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={control}
              name="quickApproveAmount"
              render={({ field, fieldState }) => (
                <Field label={t('quick.amount')} error={fieldState.error?.message}>
                  <NumberInput
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value ?? 0)
                    }}
                    min={0}
                    prefix={symbol}
                    formatOptions={{ maximumFractionDigits: 2 }}
                    disabled={isReadOnly}
                  />
                </Field>
              )}
            />
            <FormField
              control={control}
              name="quickApproveRisk"
              render={({ field }) => (
                <Field label={t('quick.risk')}>
                  <SegmentedControl
                    label={t('quick.risk')}
                    options={GUARD_QUICK_APPROVE_RISKS.map((value) => ({
                      value,
                      label: t(`quick.risks.${value}`),
                      isDisabled: isReadOnly,
                    }))}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                </Field>
              )}
            />
          </div>
        </fieldset>
        <div className="flex flex-col gap-3">
          <FormField
            control={control}
            name="stepUpEnabled"
            render={({ field }) => (
              <SwitchField
                label={t('stepUp.label')}
                description={t('stepUp.help')}
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isReadOnly}
              />
            )}
          />
          {isStepUpEnabled && (
            <FormField
              control={control}
              name="stepUpAmount"
              render={({ field, fieldState }) => (
                <Field
                  label={t('stepUp.amount')}
                  error={fieldState.error?.message}
                  className="max-w-xs"
                >
                  <NumberInput
                    value={field.value}
                    onValueChange={field.onChange}
                    min={0}
                    prefix={symbol}
                    formatOptions={{ maximumFractionDigits: 2 }}
                    disabled={isReadOnly}
                  />
                </Field>
              )}
            />
          )}
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-label text-foreground">{t('target.legend')}</legend>
          <p className="text-body text-foreground-secondary">{t('target.help')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={control}
              name="targetValue"
              render={({ field, fieldState }) => (
                <Field label={t('target.value')} error={fieldState.error?.message}>
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
              name="targetUnit"
              render={({ field }) => (
                <Field label={t('target.unit')}>
                  <SelectInput
                    options={TARGET_UNITS.map((value) => ({
                      value,
                      label: t(`target.units.${value}`),
                    }))}
                    value={field.value}
                    onValueChange={field.onChange}
                    isDisabled={isReadOnly}
                  />
                </Field>
              )}
            />
          </div>
        </fieldset>
      </div>
    </Section>
  )
}
