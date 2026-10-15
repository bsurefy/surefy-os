// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BookText, Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { PromptDto } from '@surefy/contracts'
import { DataTableSearch, EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { SegmentedControl } from '@surefy/ui/components/Forms'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Badge } from '@surefy/ui/primitives/badge'
import { Button } from '@surefy/ui/primitives/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import PromptFill from './PromptFill'
import PromptForm from './PromptForm'
import { PROMPT_PREVIEW_LINES } from './PromptLibrary.constants'
import { usePromptLibraryController } from './PromptLibrary.controller'

import type { PromptLibraryController, PromptLibraryProps } from './PromptLibrary.controller'

function Audience({ prompt }: Readonly<{ prompt: PromptDto }>) {
  const t = useTranslations('chat.prompts')
  if (prompt.visibility === 'personal') return <Badge variant="neutral">{t('personal')}</Badge>
  const teams = prompt.teams.map((team) => team.name).join(', ')
  return (
    <Badge variant="neutral">{teams === '' ? t('sharedAll') : t('sharedTeams', { teams })}</Badge>
  )
}

function PromptRow({ prompt, c }: Readonly<{ prompt: PromptDto; c: PromptLibraryController }>) {
  const { t } = c
  return (
    <li className="hover:bg-surface-2 flex items-start gap-2 rounded-lg px-2 py-2">
      <button
        type="button"
        className="focus-visible:ring-ring flex min-w-0 flex-1 flex-col gap-1 rounded-md text-left outline-none focus-visible:ring-2"
        aria-label={t('use', { title: prompt.title })}
        onClick={() => {
          c.onUse(prompt)
        }}
      >
        <span className="text-body truncate font-medium">{prompt.title}</span>
        <span
          className="text-caption text-muted-foreground"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: PROMPT_PREVIEW_LINES,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {prompt.body}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Audience prompt={prompt} />
          {prompt.variables.map((name) => (
            <Badge key={name} variant="outline" className="font-mono">
              {`{${name}}`}
            </Badge>
          ))}
        </span>
      </button>
      {prompt.canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('actions', { title: prompt.title })}
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                c.form.onEdit(prompt)
              }}
            >
              <Pencil aria-hidden />
              {t('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                c.onDelete(prompt)
              }}
            >
              <Trash2 aria-hidden />
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}

function PromptList({ c }: Readonly<{ c: PromptLibraryController }>) {
  const { t, pages } = c
  if (pages.isLoading) {
    return (
      <div aria-busy className="flex flex-col gap-2">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-16 w-full" />
        ))}
      </div>
    )
  }
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
  if (pages.prompts.length === 0) {
    return c.isFiltered ? (
      <EmptyState
        icon={BookText}
        title={t('noResults.title')}
        description={t('noResults.description')}
        headingLevel={3}
      />
    ) : (
      <EmptyState
        icon={BookText}
        title={t('empty.title')}
        description={t('empty.description')}
        headingLevel={3}
        actionLabel={t('new')}
        onAction={c.form.onCreate}
      />
    )
  }
  return (
    <>
      <ul aria-label={t('list')} className="flex flex-col gap-0.5">
        {pages.prompts.map((prompt) => (
          <PromptRow key={prompt.id} prompt={prompt} c={c} />
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

/**
 * The prompt library (chat.md §2): personal and shared prompts with `{variables}`, searchable.
 * Using one fills its variables and puts the text in the composer; Builders and above also create
 * and manage shared prompts, limited to teams if they like.
 */
export default function PromptLibrary(props: Readonly<PromptLibraryProps>) {
  const c = usePromptLibraryController(props)
  const { t } = c
  const deleting = c.pendingDelete.prompt

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) props.onClose()
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex min-h-72 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DataTableSearch
                label={t('search.label')}
                placeholder={t('search.placeholder')}
                value={c.search}
                onValueChange={c.onSearchChange}
              />
              <Button size="sm" onClick={c.form.onCreate}>
                <Plus aria-hidden />
                {t('new')}
              </Button>
            </div>
            <SegmentedControl
              label={t('filter.label')}
              size="sm"
              value={c.filter}
              onValueChange={c.onFilterChange}
              options={[
                { value: 'all', label: t('filter.all') },
                { value: 'personal', label: t('filter.personal') },
                { value: 'shared', label: t('filter.shared') },
              ]}
            />
            <PromptList c={c} />
          </DialogBody>
        </DialogContent>
      </Dialog>
      {c.form.target && (
        <PromptForm
          orgId={props.orgId}
          target={c.form.target}
          canManageShared={c.canManageShared}
          onClose={c.form.onClose}
        />
      )}
      {c.fill.target && (
        <PromptFill prompt={c.fill.target} onSubmit={c.fill.onSubmit} onClose={c.fill.onClose} />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) c.pendingDelete.onCancel()
        }}
        tier="T2"
        title={t('deleteShared.title', { title: deleting?.title ?? '' })}
        description={t('deleteShared.description')}
        impact={
          deleting
            ? [
                deleting.teams.length === 0
                  ? t('deleteShared.impactAll')
                  : t('deleteShared.impactTeams', {
                      teams: deleting.teams.map((team) => team.name).join(', '),
                    }),
              ]
            : undefined
        }
        labels={{ confirm: t('deleteShared.confirm') }}
        tone="destructive"
        onConfirm={c.pendingDelete.onConfirm}
      />
    </>
  )
}
