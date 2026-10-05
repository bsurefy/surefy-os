// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, Download, Ellipsis, FolderInput, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { ChatDto } from '@surefy/contracts'
import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import type { ChatRowContext } from './ChatRow.types'

/** One chat in the list: a link to the thread and its "⋯" menu (Rename, Pin, Move, Export, Delete). */
export default function ChatRow({ chat, ctx }: Readonly<{ chat: ChatDto; ctx: ChatRowContext }>) {
  const t = useTranslations('chat.list')
  const { actions, folders } = ctx
  const isActive = ctx.openChatId === chat.id
  const title = chat.title || t('untitled')

  return (
    <li className="group relative">
      <Link
        href={toRoute(ROUTES.workspace.chat(ctx.orgSlug, chat.id))}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'text-body hover:bg-surface-2 flex min-w-0 flex-col rounded-lg px-2 py-1.5 pr-9',
          isActive && 'bg-surface-2 font-medium',
        )}
      >
        <span className="flex items-center gap-1.5">
          {chat.isPinned && <Pin aria-label={t('pinned')} className="size-3 shrink-0" />}
          <span className="truncate">{title}</span>
        </span>
        {chat.matchedText && (
          <span className="text-caption text-muted-foreground truncate">{chat.matchedText}</span>
        )}
      </Link>
      <div className="absolute top-1/2 right-1 -translate-y-1/2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('row.actions', { title })}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                ctx.onRename(chat)
              }}
            >
              <Pencil aria-hidden />
              {t('row.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                actions.onPin(chat)
              }}
            >
              {chat.isPinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
              {chat.isPinned ? t('row.unpin') : t('row.pin')}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput aria-hidden />
                {t('row.moveToFolder')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {chat.folderId && (
                  <DropdownMenuItem
                    onSelect={() => {
                      actions.onMove(chat, null)
                    }}
                  >
                    {t('row.noFolder')}
                  </DropdownMenuItem>
                )}
                {folders.length === 0 && (
                  <DropdownMenuItem disabled>{t('row.noFolders')}</DropdownMenuItem>
                )}
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    disabled={folder.id === chat.folderId}
                    onSelect={() => {
                      actions.onMove(chat, folder.id)
                    }}
                  >
                    {folder.id === chat.folderId && <Check aria-hidden />}
                    {folder.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onSelect={() => {
                ctx.onExport(chat)
              }}
            >
              <Download aria-hidden />
              {t('row.export')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                actions.onDelete(chat)
              }}
            >
              <Trash2 aria-hidden />
              {t('row.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
