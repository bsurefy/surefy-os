// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronDown, ChevronRight, Ellipsis, Folder, Pencil, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'

import type { ChatFolderDto } from '@surefy/contracts'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useChatPages } from '../ChatList.hooks'
import ChatRow from '../ChatRow'

import type { ChatRowContext } from '../ChatRow'

interface FolderSectionProps {
  orgId: string
  folder: ChatFolderDto
  ctx: ChatRowContext
  isExpanded: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
}

/** The chats of one folder, loaded when it is opened. */
function FolderChats({
  orgId,
  folder,
  ctx,
}: Readonly<{ orgId: string; folder: ChatFolderDto; ctx: ChatRowContext }>) {
  const t = useTranslations('chat.list')
  const pages = useChatPages(orgId, { folderId: folder.id })

  if (pages.isLoading) return <Skeleton className="mx-2 my-1 h-8" />
  if (pages.errorMessage) {
    return (
      <ErrorState
        size="sm"
        headingLevel={3}
        message={pages.errorMessage}
        reference={pages.errorReference}
        onRetry={pages.refetch}
      />
    )
  }
  if (pages.chats.length === 0) {
    return <p className="text-caption text-muted-foreground px-2 py-1">{t('folders.empty')}</p>
  }
  return (
    <>
      <ul className="flex flex-col gap-0.5">
        {pages.chats.map((chat) => (
          <ChatRow key={chat.id} chat={chat} ctx={ctx} />
        ))}
      </ul>
      <LoadMore
        label={t('loadMore')}
        hasMore={pages.hasMore}
        isLoading={pages.isLoadingMore}
        onLoadMore={pages.onLoadMore}
      />
    </>
  )
}

/** A folder row that opens to its chats, with Rename and Delete in its "⋯" menu. */
export default function FolderSection({
  orgId,
  folder,
  ctx,
  isExpanded,
  onToggle,
  onRename,
  onDelete,
}: Readonly<FolderSectionProps>) {
  const t = useTranslations('chat.list')
  const panelId = useId()
  const Chevron = isExpanded ? ChevronDown : ChevronRight

  return (
    <li className="flex flex-col gap-0.5">
      <div className="group relative">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={onToggle}
          className="text-body hover:bg-surface-2 flex w-full min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 pr-9 text-left"
        >
          <Chevron aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <Folder aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{folder.name}</span>
          <span className="text-caption text-muted-foreground ml-auto shrink-0">
            {folder.chatCount}
          </span>
        </button>
        <div className="absolute top-1/2 right-1 -translate-y-1/2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('folders.actions', { name: folder.name })}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onRename}>
                <Pencil aria-hidden />
                {t('folders.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 aria-hidden />
                {t('folders.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div id={panelId} hidden={!isExpanded} className="pl-4">
        {isExpanded && <FolderChats orgId={orgId} folder={folder} ctx={ctx} />}
      </div>
    </li>
  )
}
