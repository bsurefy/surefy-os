// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ArrowUp, FileText, Paperclip, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { getProviderName } from '@/modules/Vault'
import { Banner } from '@surefy/ui/components/Feedback'
import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'
import { Progress } from '@surefy/ui/primitives/progress'
import { Textarea } from '@surefy/ui/primitives/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@surefy/ui/primitives/tooltip'

import { ATTACHMENT_ACCEPT, ATTACHMENT_LIMIT_MB, COMPOSER_MAX_ROWS } from '../ChatThread.constants'
import { isLocalModel } from '../ThreadView/ThreadView.settings'

import type { ThreadViewController } from '../ThreadView/ThreadView.controller'

const rowsOf = (text: string) => Math.min(COMPOSER_MAX_ROWS, Math.max(1, text.split('\n').length))

/**
 * The composer (chat.md §3): one frame with the text, the file chips and the toolbar; Enter sends,
 * Shift+Enter adds a line, ↑ in an empty box edits the last message. Files are added by the button
 * or by dropping them; each shows its progress and its own error, and a failed file never blocks
 * sending without it. A note under the frame says where the model runs.
 */
export default function Composer({ c }: Readonly<{ c: ThreadViewController }>) {
  const t = useTranslations('chat.thread.composer')
  const fileInput = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { composer, attachments } = c
  const isBusy = c.activity !== 'idle'
  const isBlocked = c.hasModels === false || !c.isOnline
  const model = c.settings.currentModel
  const isLocal = isLocalModel(model)
  const limits = t('limits', {
    image: ATTACHMENT_LIMIT_MB.image,
    document: ATTACHMENT_LIMIT_MB.document,
  })

  const addFiles = (files: FileList | null) => {
    if (files) attachments.add([...files])
  }

  return (
    <div className="flex flex-col gap-2">
      {!c.isOnline && <Banner tone="warning" title={t('offline')} isAnnounced />}
      {composer.isVisionBlocked && <Banner tone="warning" title={t('noVision')} isAnnounced />}
      <div
        className={cn(
          'border-border bg-surface focus-within:border-primary focus-within:ring-ring/30 duration-fast flex flex-col rounded-[0.875rem] border transition-[border-color,box-shadow] focus-within:ring-[3px]',
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
        {attachments.items.length > 0 && (
          <ul aria-label={t('attachments')} className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {attachments.items.map((item) => (
              <li
                key={item.key}
                className="border-border bg-surface-2 text-caption flex max-w-full min-w-0 flex-col gap-1 rounded-lg border py-1 pr-1 pl-2"
              >
                <div className="flex items-center gap-1.5">
                  <FileText aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
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
                  {item.status === 'failed' &&
                    item.errorCode === 'CHAT_ATTACHMENT_UPLOAD_FAILED' && (
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
                    className="ml-auto size-5"
                    aria-label={t('remove', { name: item.name })}
                    onClick={() => {
                      attachments.remove(item.key)
                    }}
                  >
                    <X aria-hidden className="size-3" />
                  </Button>
                </div>
                {item.status === 'uploading' && (
                  <Progress
                    value={item.progress}
                    aria-label={t('uploading', { name: item.name })}
                  />
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
          className="text-body-lg min-h-13 resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent"
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
        <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-2">
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-md"
                aria-label={t('attach')}
                aria-description={limits}
                disabled={isBlocked}
                className="size-8"
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-72">
              {limits}
            </TooltipContent>
          </Tooltip>
          <div className="ml-auto">
            {isBusy ? (
              <Button
                variant="secondary"
                size="sm"
                aria-label={t('stop')}
                className="h-8 rounded-full"
                onClick={c.stream.stop}
              >
                <span aria-hidden className="size-2.5 rounded-xs bg-current" />
                {t('stopShort')}
              </Button>
            ) : (
              <Button
                size="icon-md"
                aria-label={t('send')}
                disabled={!composer.canSend}
                className="size-8 rounded-full"
                onClick={composer.onSend}
              >
                <ArrowUp aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </div>
      {model && (
        <p className="text-caption text-muted-foreground flex items-center justify-center gap-1.5 text-center">
          <span
            aria-hidden
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              isLocal ? 'bg-success' : 'bg-foreground-secondary',
            )}
          />
          {isLocal
            ? t('footnote.local', { model: model.displayName })
            : t('footnote.provider', {
                model: model.displayName,
                provider: getProviderName(model.providerKey),
              })}
        </p>
      )}
    </div>
  )
}
