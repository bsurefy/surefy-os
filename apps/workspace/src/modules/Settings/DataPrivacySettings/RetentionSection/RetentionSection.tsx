// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'

import { useRetentionSectionController } from './RetentionSection.controller'

/** "Where data is stored, retention per data type". */
export default function RetentionSection() {
  const { retention, isLoading, errorMessage, errorReference, refetch, t } =
    useRetentionSectionController()

  if (isLoading) return <SkeletonCard lines={4} />
  if (errorMessage || !retention) {
    return (
      <ErrorState
        title={t('loadError')}
        message={errorMessage ?? t('loadError')}
        reference={errorReference}
        onRetry={refetch}
        size="sm"
      />
    )
  }

  return (
    <Section
      title={t('title')}
      description={retention.region ? t('region', { region: retention.region }) : t('selfHosted')}
    >
      <dl className="flex flex-col divide-y">
        {retention.items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-body">{t(`items.${item.key}`)}</dt>
            <dd className="text-body text-muted-foreground">
              {item.retentionDays === null
                ? t('untilDeleted')
                : t('days', { count: item.retentionDays })}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}
