// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { AuditEntryDto } from '@surefy/contracts'
import { CodeBlock, StatusPill } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { SidePanel } from '@surefy/ui/components/Overlay'

import { useAuditEntryDetailController } from './AuditEntryDetail.controller'
import { AUDIT_TIME_FORMAT, OUTCOME_TONE } from '../AuditLog.constants'
import { useAuditLabels } from '../AuditLog.hooks'
import { formatPayload } from '../AuditLog.utils'

import type { ReactNode } from 'react'

interface AuditEntryDetailProps {
  orgId: string
  entryId: string
  /** The entry's row in the table, when loaded. */
  row: AuditEntryDto | undefined
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
}

function DetailList({ items }: Readonly<{ items: [string, ReactNode][] }>) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2">
      {items.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-caption text-muted-foreground">{term}</dt>
          <dd className="text-body min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const mono = (value: string) => <span className="font-mono text-xs break-all">{value}</span>

/** The loaded entry: summary, request, signature and payload. */
function EntryBody({ entry }: Readonly<{ entry: AuditEntryDto }>) {
  const t = useTranslations('guard.auditLog.detail')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const labels = useAuditLabels()
  const none = t('none')
  const { integrity } = entry
  const summary: [string, ReactNode][] = [
    [t('who'), `${labels.actor(entry)} · ${labels.actorType(entry)}`],
    [t('via'), labels.via(entry)],
    [t('object'), labels.object(entry)],
    [
      t('result'),
      <StatusPill key="result" label={labels.outcome(entry)} tone={OUTCOME_TONE[entry.outcome]} />,
    ],
  ]
  if (entry.reason) summary.push([t('reason'), entry.reason])
  if (entry.modelKey) {
    summary.push([
      t('model'),
      entry.confidence === null
        ? entry.modelKey
        : t('modelWithConfidence', {
            model: entry.modelKey,
            confidence: format.number(entry.confidence, { style: 'percent' }),
          }),
    ])
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('summary')} isPlain>
        <DetailList items={summary} />
      </Section>
      <Section title={t('request')} isPlain>
        <DetailList
          items={[
            [t('requestId'), entry.requestId ? mono(entry.requestId) : none],
            [t('ip'), entry.ip ?? none],
            [t('userAgent'), entry.userAgent ?? none],
          ]}
        />
      </Section>
      <Section title={t('integrity')} description={t('integrityHelp')} isPlain>
        <DetailList
          items={[
            [t('entryId'), mono(entry.id)],
            [
              t('signature'),
              integrity.chainHash ? (
                mono(integrity.chainHash)
              ) : (
                <span className="text-muted-foreground">{t('sealing')}</span>
              ),
            ],
            [
              t('chain'),
              integrity.chainSeq === null || !integrity.sealedAt
                ? t('notChainedYet')
                : t('chained', {
                    position: format.number(integrity.chainSeq),
                    sealedAt: format.dateTime(new Date(integrity.sealedAt), AUDIT_TIME_FORMAT),
                  }),
            ],
          ]}
        />
      </Section>
      <Section title={t('payload')} isPlain>
        <CodeBlock
          code={formatPayload(entry)}
          language="json"
          labels={{ copy: tCommon('copy'), copied: tCommon('copied') }}
        />
      </Section>
    </div>
  )
}

/**
 * One audit entry in a side panel: who did what to which object, the request it came from, the
 * signature that chains it to the previous entry, and the payload.
 */
export default function AuditEntryDetail({
  orgId,
  entryId,
  row,
  onClose,
  onPrevious,
  onNext,
}: Readonly<AuditEntryDetailProps>) {
  const c = useAuditEntryDetailController(orgId, entryId, row)
  const { t, entry } = c
  const format = useFormatter()
  const labels = useAuditLabels()

  let body
  if (c.isLoading) body = <SkeletonCard lines={8} />
  else if (c.errorMessage || !entry) {
    body = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage ?? t('loadError')}
        reference={c.errorReference}
        onRetry={c.refetch}
        size="sm"
      />
    )
  } else {
    body = <EntryBody entry={entry} />
  }

  return (
    <SidePanel
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={entry ? labels.action(entry.action) : t('title')}
      description={
        entry ? format.dateTime(new Date(entry.createdAt), AUDIT_TIME_FORMAT) : undefined
      }
      size="lg"
      onPrevious={onPrevious}
      onNext={onNext}
    >
      {body}
    </SidePanel>
  )
}
