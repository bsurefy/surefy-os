// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ArrowUp, Paperclip, Square, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { Banner } from '@surefy/ui/components/Feedback'
import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'
import { Progress } from '@surefy/ui/primitives/progress'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { ATTACHMENT_ACCEPT, ATTACHMENT_LIMIT_MB, COMPOSER_MAX_ROWS } from '../ChatThread.constants'

import type { ThreadViewController } from '../ThreadView/ThreadView.controller'

const rowsOf = (text: string) => Math.min(COMPOSER_MAX_ROWS, Math.max(1, text.split('\n').length))

/**
 * The composer (chat.md §3): Enter sends, Shift+Enter adds a line, ↑ in an empty box edits the last
 * message. Files are added by the button or by dropping them; each shows its progress and its own
 * error, and a failed file never blocks sending without it.
 */
export default function Composer({ c }: Readonly<{ c: ThreadViewController }>) {
  const t = useTranslations('chat.thread.composer')
  const fileInput = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { composer, attachments } = c
  const isBusy = c.activity !== 'idle'
  const isBlocked = c.hasModels === false || !c.isOnline

  const addFiles = (files: FileList | null) => {
    if (files) attachments.add([...files])
  }

  return (
    <div
      className={cn(
        'border-border bg-surface flex flex-col gap-2 rounded-2xl border p-3',
        isDragging && 'border-primary',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => {
        setIsDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        addFiles(event.dataTransfer.files)
      }}
    >
      {!c.isOnline && <Banner tone="warning" title={t('offline')} isAnnounced />}
      {composer.isVisionBlocked && <Banner tone="warning" title={t('noVision')} isAnnounced />}
      {attachments.items.length > 0 && (
        <ul aria-label={t('attachments')} className="flex flex-col gap-2">
          {attachments.items.map((item) => (
            <li key={item.key} className="text-caption flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{item.name}</span>
                {item.status === 'failed' && item.errorCode && (
                  <span className="text-destructive" role="alert">
                    {t(`errors.${item.errorCode}`, {
                      name: item.name,
                      image: ATTACHMENT_LIMIT_MB.image,
                      document: ATTACHMENT_LIMIT_MB.document,
                    })}
                  </span>
                )}
                {item.status === 'failed' && item.errorCode === 'CHAT_ATTACHMENT_UPLOAD_FAILED' && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      attachments.retry(item.key)
                    }}
                  >
                    {t('retry')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label={t('remove', { name: item.name })}
                  onClick={() => {
                    attachments.remove(item.key)
                  }}
                >
                  <X aria-hidden />
                </Button>
              </div>
              {item.status === 'uploading' && (
                <Progress value={item.progress} aria-label={t('uploading', { name: item.name })} />
              )}
            </li>
          ))}
        </ul>
      )}
      <Textarea
        aria-label={t('label')}
        placeholder={t('placeholder')}
        rows={rowsOf(composer.text)}
        value={composer.text}
        disabled={c.hasModels === false}
        className="resize-none border-0 shadow-none focus-visible:ring-0"
        onChange={(event) => {
          composer.onTextChange(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            composer.onSend()
          } else if (event.key === 'ArrowUp' && composer.text === '') {
            event.preventDefault()
            composer.onEditLast()
          }
        }}
      />
      <div className="flex items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept={ATTACHMENT_ACCEPT}
          aria-label={t('files')}
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('attach')}
          disabled={isBlocked}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip aria-hidden />
        </Button>
        <p className="text-caption text-muted-foreground">
          {t('limits', {
            image: ATTACHMENT_LIMIT_MB.image,
            document: ATTACHMENT_LIMIT_MB.document,
          })}
        </p>
        <div className="ml-auto">
          {isBusy ? (
            <Button size="icon-sm" aria-label={t('stop')} onClick={c.stream.stop}>
              <Square aria-hidden />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              aria-label={t('send')}
              disabled={!composer.canSend}
              onClick={composer.onSend}
            >
              <ArrowUp aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
