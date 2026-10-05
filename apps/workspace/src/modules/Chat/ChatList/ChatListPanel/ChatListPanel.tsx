// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { MessagesSquare, Plus, Search, SquarePen, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

import ChatExportDialog from '../ChatExportDialog'
import { useChatListController } from '../ChatList.controller'
import { ChatListSkeleton, DatedChats, PinnedChats, SearchResults } from '../ChatSections'
import FolderSection from '../FolderSection'
import NameDialog from '../NameDialog'
import RecentlyDeleted from '../RecentlyDeleted'

/** The chat list's content (chat.md §1): New chat and search, Pinned, Folders, the chats by date and Recently deleted. */
export default function ChatListPanel() {
  const c = useChatListController()
  const { t, ctx } = c

  let body
  if (c.view === 'deleted') {
    body = <RecentlyDeleted orgId={c.orgId} actions={c.actions} onBack={c.onCloseDeleted} />
  } else if (c.isSearching) {
    body = <SearchResults pages={c.results} ctx={ctx} query={c.query} onClear={c.onClearSearch} />
  } else if (c.isLoading) {
    body = <ChatListSkeleton />
  } else if (c.loadError) {
    body = (
      <ErrorState
        size="sm"
        headingLevel={3}
        message={c.loadError}
        reference={c.loadErrorReference}
        onRetry={c.onRetry}
      />
    )
  } else if (c.isEmpty) {
    body = (
      <EmptyState
        icon={MessagesSquare}
        title={t('empty.title')}
        description={t('empty.description')}
        headingLevel={3}
      />
    )
  } else {
    body = (
      <>
        <PinnedChats pages={c.pinned} ctx={ctx} />
        <section aria-label={t('folders.title')} className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between px-2 pb-1">
            <h3 className="text-caption text-muted-foreground font-medium">{t('folders.title')}</h3>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('folders.new')}
              onClick={c.onNewFolder}
            >
              <Plus aria-hidden />
            </Button>
          </div>
          <ul className="flex flex-col gap-0.5">
            {c.folders.map((folder) => (
              <FolderSection
                key={folder.id}
                orgId={c.orgId}
                folder={folder}
                ctx={ctx}
                isExpanded={c.expandedFolderIds.includes(folder.id)}
                onToggle={() => {
                  c.onToggleFolder(folder.id)
                }}
                onRename={() => {
                  c.onRenameFolder(folder)
                }}
                onDelete={() => {
                  c.actions.onDeleteFolder(folder)
                }}
              />
            ))}
          </ul>
        </section>
        <DatedChats pages={c.dated} ctx={ctx} />
      </>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Button asChild>
        <Link href={toRoute(ROUTES.workspace.chat(ctx.orgSlug))}>
          <SquarePen aria-hidden />
          {t('newChat')}
        </Link>
      </Button>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
        }}
        className="relative"
      >
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          value={c.search}
          onChange={(event) => {
            c.onSearchChange(event.target.value)
          }}
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
          autoComplete="off"
          className="pl-8"
        />
      </form>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">{body}</div>
      {c.view === 'chats' && !c.isSearching && (
        <Button variant="ghost" className="justify-start" onClick={c.onOpenDeleted}>
          <Trash2 aria-hidden />
          {t('deleted.title')}
        </Button>
      )}
      {c.dialog?.kind === 'export' ? (
        <ChatExportDialog orgId={c.orgId} chatId={c.dialog.chat.id} onClose={c.onCloseDialog} />
      ) : (
        c.dialog && <NameDialog orgId={c.orgId} target={c.dialog} onClose={c.onCloseDialog} />
      )}
    </div>
  )
}
