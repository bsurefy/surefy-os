// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { Banner } from '@surefy/ui/components/Feedback'
import { Field, SliderInput, SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { toBasisPoints, toPercent } from '../GuardTab.utils'

import type { Thresholds } from '../GuardTab.utils'

const MAX_PERCENT = 100

interface ThresholdsSectionProps {
  /** The organization's; null until they are read. */
  organization: Thresholds | null
  /** This agent's own; null follows the organization's. */
  own: Thresholds | null
  isOutdated: boolean
  isReadOnly: boolean
  onUseOrganization: (shouldFollow: boolean) => void
  onChange: (own: Thresholds) => void
  onRaise: () => void
}

/**
 * This agent's confidence thresholds: the organization's by default, or its own, which can be as
 * high as the organization's and higher but never lower. The sliders start at the organization's
 * values, so a looser value cannot be set.
 */
export default function ThresholdsSection({
  organization,
  own,
  isOutdated,
  isReadOnly,
  onUseOrganization,
  onChange,
  onRaise,
}: Readonly<ThresholdsSectionProps>) {
  const t = useTranslations('agents.editor.guard.thresholds')
  const effective = own ?? organization
  const auto = effective ? toPercent(effective.autoBp) : 0
  const review = effective ? toPercent(effective.reviewBp) : 0

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-4">
        {isOutdated && (
          <Banner
            tone="warning"
            title={t('outdated.title')}
            description={t('outdated.description')}
            action={
              !isReadOnly && (
                <Button size="sm" variant="secondary" onClick={onRaise}>
                  {t('outdated.raise')}
                </Button>
              )
            }
          />
        )}
        <SwitchField
          label={t('follow.label')}
          description={
            organization
              ? t('follow.help', {
                  auto: toPercent(organization.autoBp),
                  review: toPercent(organization.reviewBp),
                })
              : undefined
          }
          checked={own === null}
          onCheckedChange={onUseOrganization}
          disabled={isReadOnly || organization === null}
        />
        {own !== null && organization !== null && (
          <>
            <Field label={t('auto.label')} description={t('auto.help')}>
              <SliderInput
                label={t('auto.label')}
                value={auto}
                min={toPercent(organization.autoBp)}
                max={MAX_PERCENT}
                step={1}
                suffix="%"
                onValueChange={(percent) => {
                  onChange({ ...own, autoBp: toBasisPoints(percent) })
                }}
                isDisabled={isReadOnly}
              />
            </Field>
            <Field label={t('review.label')} description={t('review.help')}>
              <SliderInput
                label={t('review.label')}
                value={review}
                min={toPercent(organization.reviewBp)}
                max={auto}
                step={1}
                suffix="%"
                onValueChange={(percent) => {
                  onChange({ ...own, reviewBp: toBasisPoints(percent) })
                }}
                isDisabled={isReadOnly}
              />
            </Field>
            <p className="text-caption text-muted-foreground">
              {t('floor', {
                auto: toPercent(organization.autoBp),
                review: toPercent(organization.reviewBp),
              })}
            </p>
          </>
        )}
        {effective && <p className="text-body text-foreground">{t('result', { auto, review })}</p>}
      </div>
    </Section>
  )
}
