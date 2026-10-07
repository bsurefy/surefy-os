// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Fragment } from 'react'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'
import { Kbd } from '@surefy/ui/primitives/kbd'

import { useShortcutsDialogController } from './ShortcutsDialog.controller'

/** "?" or the user menu: every keyboard shortcut of the workspace. */
export default function ShortcutsDialog() {
  const { isOpen, onOpenChange, rows, then, t } = useShortcutsDialogController()

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shortcuts.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <dl className="flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4">
                <dt className="text-body">{row.description}</dt>
                <dd className="text-caption text-muted-foreground flex shrink-0 items-center gap-1">
                  {row.keys.map((key, index) => (
                    <Fragment key={key}>
                      {index > 0 && row.id.startsWith('go-') && <span>{then}</span>}
                      <Kbd>{key}</Kbd>
                    </Fragment>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
