// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'

import { guardQueries } from '@/api/guard'
import { useDebouncedValue } from '@/hooks'
import { Button } from '@surefy/ui/primitives/button'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { percentToBasisPoints } from '../../Guard.utils'
import { IMPACT_DEBOUNCE_MS } from '../GuardDefaults.constants'

const BANDS = [
  { key: 'auto', field: 'auto' },
  { key: 'doubleCheck', field: 'doubleCheck' },
  { key: 'human', field: 'human' },
] as const

/**
 * "With these values, 412 of the last 1,000 actions would have needed a person": asks the API
 * for the proposed thresholds once the sliders rest, and keeps the last answer on screen while the
 * next one loads.
 */
export default function ImpactPreview({
  autoPercent,
  reviewPercent,
}: Readonly<{ autoPercent: number; reviewPercent: number }>) {
  const t = useTranslations('guard.defaults.impact')
  const format = useFormatter()
  const orgId = useCurrentOrgId()
  const thresholds = useDebouncedValue({ autoPercent, reviewPercent }, IMPACT_DEBOUNCE_MS)
  const isValid = thresholds.reviewPercent < thresholds.autoPercent
  const impact = useQuery({
    ...guardQueries.defaultsImpact(orgId, {
      autoThresholdBp: percentToBasisPoints(thresholds.autoPercent),
      reviewThresholdBp: percentToBasisPoints(thresholds.reviewPercent),
    }),
    enabled: isValid,
  })
  const { data } = impact

  let body
  if (!isValid || reviewPercent >= autoPercent) {
    body = <p className="text-body text-foreground-secondary">{t('invalid')}</p>
  } else if (impact.error && !data) {
    body = (
      <p className="text-body text-destructive flex flex-wrap items-center gap-2">
        {t('error')}
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            void impact.refetch()
          }}
        >
          {t('retry')}
        </Button>
      </p>
    )
  } else if (!data) {
    body = <p className="text-body text-foreground-secondary">{t('loading')}</p>
  } else if (data.sampleSize === 0) {
    body = <p className="text-body text-foreground-secondary">{t('empty')}</p>
  } else {
    body = (
      <>
        <p className="text-body text-foreground">
          {t('headline', {
            human: format.number(data.human),
            total: format.number(data.sampleSize),
          })}
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          {BANDS.map(({ key, field }) => (
            <div key={key} className="flex flex-col">
              <dt className="text-caption text-muted-foreground">{t(`bands.${key}`)}</dt>
              <dd className="text-object-title tabular-nums">{format.number(data[field])}</dd>
            </div>
          ))}
        </dl>
      </>
    )
  }

  return (
    <div
      aria-live="polite"
      aria-busy={impact.isFetching || undefined}
      className="border-border bg-surface-2 flex flex-col gap-3 rounded-lg border p-4"
    >
      <h3 className="text-label text-foreground">{t('title')}</h3>
      {body}
    </div>
  )
}
