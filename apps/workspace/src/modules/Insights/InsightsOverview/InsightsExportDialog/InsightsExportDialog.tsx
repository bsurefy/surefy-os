// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { ExportDto } from '@surefy/contracts'
import { Banner, Spinner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'

import { useInsightsExportController } from './InsightsExportDialog.controller'

import type { InsightsQuery } from '@/api/usage'

const BYTES_PER_KILOBYTE = 1000

interface InsightsExportDialogProps {
  orgId: string
  query: InsightsQuery
  /** "Last 30 days", "Sep 1 – Sep 10, 2026". */
  rangeLabel: string
  /** "Team: Support, Model: GPT-4.1", or empty. */
  filterLabels: string[]
  onClose: () => void
}

function ExportProgress({
  current,
  onRetry,
  isRetrying,
}: Readonly<{ current: ExportDto; onRetry: () => void; isRetrying: boolean }>) {
  const t = useTranslations('insights.overview.export')
  const format = useFormatter()

  if (current.status === 'queued' || current.status === 'preparing') {
    return (
      <p className="text-body flex items-center gap-2" role="status">
        <Spinner size="sm" />
        {t('preparing')}
      </p>
    )
  }
  if (current.status === 'ready') {
    return (
      <Banner
        tone="success"
        title={t('ready')}
        description={t('readyDetails', {
          count: current.rowCount ?? 0,
          size: format.number((current.sizeBytes ?? 0) / BYTES_PER_KILOBYTE, {
            style: 'unit',
            unit: 'kilobyte',
            maximumFractionDigits: 0,
          }),
        })}
        isAnnounced
      />
    )
  }
  return (
    <Banner
      tone={current.status === 'failed' ? 'destructive' : 'warning'}
      title={current.status === 'failed' ? t('failed') : t('expired')}
      action={
        <Button variant="secondary" size="sm" onClick={onRetry} isLoading={isRetrying}>
          {t('retry')}
        </Button>
      }
      isAnnounced
    />
  )
}

/**
 * Export usage as CSV for the range and filters on screen, prepared in the background, with the
 * personal-data notice first (the file names people).
 */
export default function InsightsExportDialog({
  orgId,
  query,
  rangeLabel,
  filterLabels,
  onClose,
}: Readonly<InsightsExportDialogProps>) {
  const c = useInsightsExportController(orgId, query)
  const { t, current } = c

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {current ? (
            <ExportProgress current={current} onRetry={c.onRetry} isRetrying={c.isRetrying} />
          ) : (
            <>
              <p className="text-body text-muted-foreground">
                {t('scope', {
                  range: rangeLabel,
                  filters: filterLabels.length > 0 ? filterLabels.join(', ') : t('noFilters'),
                })}
              </p>
              <Banner
                tone="info"
                title={t('personalData.title')}
                description={t('personalData.description')}
              />
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {current ? t('close') : t('cancel')}
          </Button>
          {!current && (
            <Button onClick={c.onStart} isLoading={c.isStarting}>
              {t('start')}
            </Button>
          )}
          {current?.status === 'ready' && (
            <Button onClick={c.onDownload} isLoading={c.isDownloading}>
              {t('download')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
