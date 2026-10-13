// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { Field, SliderInput } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { FormField } from '@surefy/ui/primitives/form'

import ImpactPreview from '../ImpactPreview'

import type { GuardDefaultsValues } from '../GuardDefaults.schema'
import type { Control } from 'react-hook-form'

const MIN_PERCENT = 0
const MAX_PERCENT = 100

interface ThresholdsSectionProps {
  control: Control<GuardDefaultsValues>
  autoPercent: number
  reviewPercent: number
  isReadOnly: boolean
}

/**
 * The confidence thresholds: sliders with the exact number next to them, the three bands they make
 * and the impact preview over the last 1,000 checked actions.
 */
export default function ThresholdsSection({
  control,
  autoPercent,
  reviewPercent,
  isReadOnly,
}: Readonly<ThresholdsSectionProps>) {
  const t = useTranslations('guard.defaults.thresholds')
  const hasDoubleCheck = reviewPercent < autoPercent
  return (
    <Section title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-5">
        <FormField
          control={control}
          name="autoPercent"
          render={({ field, fieldState }) => (
            <Field
              label={t('auto.label')}
              description={t('auto.help')}
              error={fieldState.error?.message}
            >
              <SliderInput
                label={t('auto.label')}
                value={field.value}
                min={MIN_PERCENT + 1}
                max={MAX_PERCENT}
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
            <Field
              label={t('review.label')}
              description={t('review.help')}
              error={fieldState.error?.message}
            >
              <SliderInput
                label={t('review.label')}
                value={field.value}
                min={MIN_PERCENT}
                max={MAX_PERCENT - 1}
                suffix="%"
                isDisabled={isReadOnly}
                onValueChange={field.onChange}
              />
            </Field>
          )}
        />
        <p className="text-body text-foreground-secondary">
          {hasDoubleCheck
            ? t('summary', { auto: autoPercent, review: reviewPercent, autoBelow: autoPercent - 1 })
            : t('summaryNoCheck', { auto: autoPercent })}
        </p>
        <ImpactPreview autoPercent={autoPercent} reviewPercent={reviewPercent} />
      </div>
    </Section>
  )
}
