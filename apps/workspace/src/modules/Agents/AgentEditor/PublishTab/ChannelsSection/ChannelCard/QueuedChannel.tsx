// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@surefy/ui/primitives/button'

import type { ReactNode } from 'react'

/**
 * A channel chosen for the next publish: what it will be set up with, and that it goes live with
 * the publish, or is sent to an admin then.
 */
export default function QueuedChannel({
  name,
  isRequest,
  canChange,
  onEdit,
  onDrop,
  children,
}: Readonly<{
  /** The channel's name in a sentence. */
  name: string
  /** A Builder's: an admin approves it after the publish. */
  isRequest: boolean
  canChange: boolean
  onEdit: () => void
  onDrop: () => void
  children?: ReactNode
}>) {
  const t = useTranslations('agents.editor.publish.channels.queued')
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-foreground">
        {isRequest ? t('request', { channel: name }) : t('live')}
      </p>
      {children}
      {canChange && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            {t('edit')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDrop}>
            {t('drop')}
          </Button>
        </div>
      )}
    </div>
  )
}
