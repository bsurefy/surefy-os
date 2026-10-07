// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Download, Lock, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import NameDialog from '../../ChatList/NameDialog'

import type { ThreadViewController } from '../ThreadView/ThreadView.controller'

/**
 * The thread's 56px header (chat.md §1): the chat's title (click to rename), the private badge and
 * the "⋯" menu with rename, private chat, export and delete. The model, the knowledge scope and
 * where the data goes live in the composer.
 */
export default function ThreadHeader({ c }: Readonly<{ c: ThreadViewController }>) {
  const t = useTranslations('chat.thread.header')
  const tList = useTranslations('chat.list')
  const { settings, chat } = c
  // a generated title can still be empty
  const title = chat !== null && chat.title !== '' ? chat.title : tList('untitled')

  return (
    <header className="border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-4 md:px-5">
      {chat ? (
        <button
          type="button"
          title={t('titleHint')}
          className="text-section-title hover:bg-surface-2 focus-visible:ring-ring duration-fast -mx-1.5 min-w-0 truncate rounded-md px-1.5 py-1 text-left transition-colors outline-none focus-visible:ring-2"
          onClick={c.renameDialog.onOpen}
        >
          {title}
        </button>
      ) : (
        <p className="text-section-title min-w-0 truncate">{title}</p>
      )}
      {settings.settings.isPrivate && (
        <span className="text-caption bg-surface-2 text-foreground-secondary inline-flex h-[1.375rem] shrink-0 items-center gap-1 rounded-full px-2 font-medium">
          <Lock aria-hidden className="size-3" />
          {t('private.badge')}
        </span>
      )}
      <div className="ml-auto shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-md" aria-label={t('menu')}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {chat && (
              <DropdownMenuItem onSelect={c.renameDialog.onOpen}>
                <Pencil aria-hidden />
                {t('rename')}
              </DropdownMenuItem>
            )}
            <DropdownMenuCheckboxItem
              checked={settings.settings.isPrivate}
              disabled={!settings.canBePrivate && !settings.settings.isPrivate}
              onCheckedChange={settings.onPrivateChange}
            >
              <span className="flex flex-col">
                <span>{t('private.toggle')}</span>
                {!settings.canBePrivate && !settings.settings.isPrivate && (
                  <span className="text-caption text-muted-foreground">
                    {t('private.needsLocal')}
                  </span>
                )}
              </span>
            </DropdownMenuCheckboxItem>
            {chat && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={c.exportDialog.onOpen}>
                  <Download aria-hidden />
                  {t('export')}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={c.onDeleteChat}>
                  <Trash2 aria-hidden />
                  {t('delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {chat && c.renameDialog.isOpen && (
        <NameDialog
          orgId={c.orgId}
          target={{ kind: 'renameChat', chat }}
          onClose={c.renameDialog.onClose}
        />
      )}
    </header>
  )
}
