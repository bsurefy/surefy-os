// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

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

import { useChatExportController } from './ChatExportDialog.controller'
import { CHAT_EXPORT_FORMATS } from '../ChatList.constants'

function ExportProgress({
  current,
  onRetry,
  isRetrying,
}: Readonly<{ current: ExportDto; onRetry: () => void; isRetrying: boolean }>) {
  const t = useTranslations('chat.list.export')

  if (current.status === 'queued' || current.status === 'preparing') {
    return (
      <p className="text-body flex items-center gap-2" role="status">
        <Spinner size="sm" />
        {t('preparing')}
      </p>
    )
  }
  if (current.status === 'ready') return <Banner tone="success" title={t('ready')} isAnnounced />
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

/** Export a chat as PDF, Markdown or JSON; the file is prepared in the background. */
export default function ChatExportDialog({
  orgId,
  chatId,
  onClose,
}: Readonly<{ orgId: string; chatId: string; onClose: () => void }>) {
  const c = useChatExportController(orgId, chatId)
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
            <SegmentedControl
              label={t('format')}
              options={CHAT_EXPORT_FORMATS.map((value) => ({
                value,
                label: t(`formats.${value}`),
              }))}
              value={c.format}
              onValueChange={c.onFormatChange}
            />
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
