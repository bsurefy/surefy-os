// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { KnowledgeDuplicateAction } from '@surefy/contracts'
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

/**
 * "Already in this knowledge base · Replace / Keep both": Replace removes the old source (restorable
 * for 30 days) and adds this one; Keep both adds it next to the old one; Skip leaves it out.
 */
export default function DuplicateFileDialog({
  fileName,
  remaining,
  onResolve,
}: Readonly<{
  fileName: string
  /** Other duplicates waiting after this one. */
  remaining: number
  onResolve: (choice: KnowledgeDuplicateAction | 'skip') => void
}>) {
  const t = useTranslations('knowledge.detail.sources.duplicate')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onResolve('skip')
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: fileName })}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-body text-muted-foreground">{t('replaceHelp')}</p>
          {remaining > 0 && (
            <p className="text-caption text-muted-foreground mt-2">
              {t('remaining', { count: remaining })}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              onResolve('skip')
            }}
          >
            {t('skip')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onResolve('keep_both')
            }}
          >
            {t('keepBoth')}
          </Button>
          <Button
            onClick={() => {
              onResolve('replace')
            }}
          >
            {t('replace')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
