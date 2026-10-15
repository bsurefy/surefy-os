// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronRight, Database, FileText, Folder, X } from 'lucide-react'

import type { KnowledgeConnectorItemDto, KnowledgeConnectorProvider } from '@surefy/contracts'
import { DataTableSearch } from '@surefy/ui/components/DataDisplay'
import { ErrorState, Spinner } from '@surefy/ui/components/Feedback'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'
import { Checkbox } from '@surefy/ui/primitives/checkbox'

import { useFolderPickerController } from './FolderPicker.controller'

import type { ConnectorFolder } from './ConnectorDialog.schema'
import type { ReactNode } from 'react'

const KIND_ICONS = { folder: Folder, page: FileText, database: Database } as const

/**
 * Choose the Drive folders or Notion pages to sync: open a folder to go down a level, the trail to
 * go back up, or search the whole account. Items another source of this base syncs are shown but
 * cannot be picked again.
 */
export default function FolderPicker({
  expired,
  ...props
}: Readonly<{
  orgId: string
  baseId: string
  connectionId: string
  provider: KnowledgeConnectorProvider
  selected: readonly ConnectorFolder[]
  ownFolderIds?: readonly string[]
  onSelectedChange: (folders: ConnectorFolder[]) => void
  /** Shown in place of the list when the account's sign-in turns out to have expired. */
  expired: ReactNode
}>) {
  const c = useFolderPickerController(props)
  const { t, noun } = c

  const row = (item: KnowledgeConnectorItemDto) => {
    const Icon = KIND_ICONS[item.kind]
    const checkboxId = `connector-item-${item.externalId}`
    const isTaken = c.isTaken(item)
    return (
      <li key={item.externalId} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
        <Checkbox
          id={checkboxId}
          checked={isTaken || c.isSelected(item)}
          disabled={isTaken}
          onCheckedChange={() => {
            c.onToggle(item)
          }}
        />
        <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <label htmlFor={checkboxId} className="flex min-w-0 flex-1 flex-col">
          <span className="text-body truncate">{item.name}</span>
          {(item.path ?? isTaken) && (
            <span className="text-caption text-muted-foreground truncate">
              {[item.path, isTaken ? t('inBase') : null].filter(Boolean).join(' · ')}
            </span>
          )}
        </label>
        {item.hasChildren && !c.isSearching && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('open', { name: item.name })}
            onClick={() => {
              c.onOpen(item)
            }}
          >
            <ChevronRight aria-hidden />
          </Button>
        )}
      </li>
    )
  }

  const list = () => {
    if (c.errorMessage) {
      return <ErrorState title={t('loadError')} message={c.errorMessage} onRetry={c.refetch} />
    }
    if (c.isLoading) {
      return (
        <div className="flex justify-center p-6">
          <Spinner label={t('loading')} />
        </div>
      )
    }
    if (c.items.length === 0) {
      return (
        <p className="text-caption text-muted-foreground p-4 text-center">
          {c.isSearching ? t(`noMatches.${noun}`) : t(`empty.${noun}`)}
        </p>
      )
    }
    return <ul className="divide-border divide-y">{c.items.map(row)}</ul>
  }

  if (c.isExpired) return <>{expired}</>

  return (
    <div className="flex flex-col gap-2.5">
      <DataTableSearch
        label={t(`search.${noun}`)}
        placeholder={t(`search.${noun}`)}
        value={c.search}
        onValueChange={c.onSearchChange}
        className="max-w-none"
      />
      {!c.isSearching && (
        <nav aria-label={t('trail')}>
          <ol className="text-caption flex flex-wrap items-center gap-1">
            <li>
              {c.trail.length === 0 ? (
                <span aria-current="location" className="font-medium">
                  {t('top')}
                </span>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => {
                    c.onGoTo(-1)
                  }}
                >
                  {t('top')}
                </Button>
              )}
            </li>
            {c.trail.map((folder, index) => (
              <li key={folder.externalId} className="flex items-center gap-1">
                <ChevronRight aria-hidden className="text-muted-foreground size-3" />
                {index === c.trail.length - 1 ? (
                  <span aria-current="location" className="font-medium">
                    {folder.name}
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => {
                      c.onGoTo(index)
                    }}
                  >
                    {folder.name}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <section
        aria-label={t(`list.${noun}`)}
        aria-busy={c.isLoading || undefined}
        className="border-border max-h-64 overflow-y-auto rounded-lg border"
      >
        {list()}
        <LoadMore
          label={t('loadMore')}
          onLoadMore={c.onLoadMore}
          isLoading={c.isLoadingMore}
          hasMore={c.hasMore}
        />
      </section>
      {props.selected.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-caption text-muted-foreground">
            {t('selected', { count: props.selected.length })}
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {props.selected.map((folder) => (
              <li
                key={folder.externalId}
                className="bg-muted text-caption flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2"
              >
                <span className="max-w-48 truncate">{folder.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('remove', { name: folder.name })}
                  onClick={() => {
                    c.onRemove(folder)
                  }}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
