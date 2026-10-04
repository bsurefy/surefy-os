// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter } from 'next-intl'

import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'

import { formatMegabytes, getExportActions, getRequestTone } from '../DataPrivacySettings.utils'
import { useExportSectionController } from './ExportSection.controller'

/** Export all data (Owner): asks first, says it holds personal data, lists the requests. */
export default function ExportSection({ canExport }: Readonly<{ canExport: boolean }>) {
  const c = useExportSectionController()
  const format = useFormatter()
  const { t } = c

  let list
  if (c.isLoading) list = <SkeletonCard lines={2} />
  else if (c.errorMessage) {
    list = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
        size="sm"
      />
    )
  } else if (c.requests.length > 0) {
    list = (
      <ul className="flex flex-col divide-y" aria-label={t('listLabel')}>
        {c.requests.map((request) => {
          const actions = getExportActions(request)
          return (
            <li key={request.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body">
                  {format.dateTime(new Date(request.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
                {request.sizeBytes !== null && (
                  <span className="text-caption text-muted-foreground">
                    {t('size', { megabytes: formatMegabytes(request.sizeBytes) })}
                  </span>
                )}
                {request.expiresAt && request.status === 'ready' && (
                  <span className="text-caption text-muted-foreground">
                    {t('expires', {
                      time: format.dateTime(new Date(request.expiresAt), { timeStyle: 'short' }),
                    })}
                  </span>
                )}
              </div>
              <StatusPill
                label={t(`status.${request.status}`)}
                tone={getRequestTone(request.status)}
              />
              {actions.canDownload && (
                <Button
                  size="sm"
                  onClick={() => {
                    c.onDownload(request.id)
                  }}
                >
                  {t('download')}
                </Button>
              )}
              {actions.canRetry && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    c.onRetry(request.id)
                  }}
                >
                  {t('retry')}
                </Button>
              )}
              {actions.canCancel && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    c.onCancel(request.id)
                  }}
                >
                  {t('cancel')}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    )
  } else list = <p className="text-body text-muted-foreground">{t('none')}</p>

  return (
    <Section
      title={t('title')}
      description={t('description')}
      actions={
        canExport ? (
          <Button variant="secondary" onClick={c.onOpenConfirm}>
            {t('request')}
          </Button>
        ) : undefined
      }
    >
      {!canExport && <p className="text-body text-muted-foreground">{t('ownersOnly')}</p>}
      {list}
      <ConfirmDialog
        open={c.isConfirming}
        onOpenChange={(open) => {
          if (!open) c.onCloseConfirm()
        }}
        tier="T2"
        title={t('confirmTitle')}
        description={t('confirmDescription')}
        impact={[t('personalData'), t('expiresNotice')]}
        labels={{ confirm: t('confirm') }}
        error={c.createError}
        onConfirm={c.onRequest}
      />
    </Section>
  )
}
