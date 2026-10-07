// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { FileText, Image as ImageIcon, Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@surefy/ui/primitives/button'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { getMessageText } from '../../ChatThread.utils'

import type { ThreadMessage } from '../../ChatThread.types'

export interface UserMessageProps {
  row: ThreadMessage
  isEditing: boolean
  /** Only saved messages can be edited, and not while an answer is streaming. */
  canEdit: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (text: string) => void
}

function EditForm({
  initial,
  onCancel,
  onSave,
}: Readonly<{ initial: string; onCancel: () => void; onSave: (text: string) => void }>) {
  const t = useTranslations('chat.thread.user')
  const [value, setValue] = useState(initial)
  const text = value.trim()
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (text) onSave(text)
      }}
    >
      <Textarea
        autoFocus
        rows={3}
        aria-label={t('editLabel')}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      />
      <p className="text-caption text-muted-foreground">{t('editHelp')}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button size="sm" type="submit" disabled={text.length === 0}>
          {t('resend')}
        </Button>
      </div>
    </form>
  )
}

/** The person's message: its text, attachment chips, and "Edit" which resends it as a new version. */
export default function UserMessage({
  row,
  isEditing,
  canEdit,
  onEdit,
  onCancelEdit,
  onSaveEdit,
}: Readonly<UserMessageProps>) {
  const t = useTranslations('chat.thread.user')
  const files = row.parts.filter((part) => part.kind === 'file')
  return (
    <article aria-label={t('label')} className="group flex flex-col items-end gap-1.5">
      <div className="bg-surface-2 text-body max-w-[85%] rounded-xl px-3.5 py-2.5">
        {isEditing ? (
          <EditForm initial={getMessageText(row)} onCancel={onCancelEdit} onSave={onSaveEdit} />
        ) : (
          <p className="whitespace-pre-wrap">{getMessageText(row)}</p>
        )}
      </div>
      {files.length > 0 && (
        <ul aria-label={t('attachments')} className="flex flex-wrap justify-end gap-1.5">
          {files.map((file) => (
            <li
              key={file.attachmentId}
              className="border-border text-caption flex items-center gap-1 rounded-lg border px-2 py-1"
            >
              {file.mediaType.startsWith('image/') ? (
                <ImageIcon aria-hidden className="size-3.5" />
              ) : (
                <FileText aria-hidden className="size-3.5" />
              )}
              {file.name}
            </li>
          ))}
        </ul>
      )}
      {canEdit && !isEditing && (
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onEdit}
        >
          <Pencil aria-hidden />
          {t('edit')}
        </Button>
      )}
    </article>
  )
}
