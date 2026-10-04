// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { FEATURES } from '@surefy/contracts'
import type { ExportDto } from '@surefy/contracts'
import { Banner, Spinner } from '@surefy/ui/components/Feedback'
import { SegmentedControl } from '@surefy/ui/components/Forms'
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
import { FeatureGate, UpgradeCard } from '@surefy/web-core/access'

import { useAuditExportController } from './AuditExportDialog.controller'
import { AUDIT_EXPORT_FORMATS } from '../AuditLog.constants'

import type { AuditLogFilters } from '../AuditLog.types'

const BYTES_PER_KILOBYTE = 1000

interface AuditExportDialogProps {
  orgId: string
  filters: AuditLogFilters
  onClose: () => void
}

function ExportProgress({
  current,
  onRetry,
  isRetrying,
}: Readonly<{ current: ExportDto; onRetry: () => void; isRetrying: boolean }>) {
  const t = useTranslations('guard.auditLog.export')
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

/** The export form: format, what is included, the personal-data notice, then progress. */
function ExportForm({ orgId, filters, onClose }: Readonly<AuditExportDialogProps>) {
  const c = useAuditExportController(orgId, filters)
  const { t, current } = c

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        {current ? (
          <ExportProgress current={current} onRetry={c.onRetry} isRetrying={c.isRetrying} />
        ) : (
          <>
            <SegmentedControl
              label={t('format')}
              options={AUDIT_EXPORT_FORMATS.map((value) => ({
                value,
                label: t(`formats.${value}`),
              }))}
              value={c.format}
              onValueChange={c.onFormatChange}
            />
            <p className="text-body text-muted-foreground">{t('scope')}</p>
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
    </>
  )
}

/**
 * Export the audit log (`audit-export`, Enterprise): CSV or JSON of the filtered log, prepared in
 * the background. Without the feature the dialog shows the feature-gate card.
 */
export default function AuditExportDialog(props: Readonly<AuditExportDialogProps>) {
  const t = useTranslations('guard.auditLog.export')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <FeatureGate
          feature={FEATURES.AUDIT_EXPORT}
          fallback={
            <DialogBody>
              <UpgradeCard feature={FEATURES.AUDIT_EXPORT} headingLevel={3} />
            </DialogBody>
          }
        >
          <ExportForm {...props} />
        </FeatureGate>
      </DialogContent>
    </Dialog>
  )
}
