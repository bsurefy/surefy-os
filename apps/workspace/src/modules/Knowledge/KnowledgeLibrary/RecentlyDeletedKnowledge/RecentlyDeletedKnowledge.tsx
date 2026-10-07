// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Trash2 } from 'lucide-react'
import { useFormatter } from 'next-intl'

import type { DeletedKnowledgeItemDto } from '@surefy/contracts'
import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { LoadMore } from '@surefy/ui/components/Navigation'
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@surefy/ui/primitives/form'
import { Input } from '@surefy/ui/primitives/input'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useRecentlyDeletedKnowledgeController } from './RecentlyDeletedKnowledge.controller'
import { getDaysLeft } from '../../Knowledge.utils'

const SKELETON_ROWS = 4

/** Recently deleted: knowledge bases and sources from the last 30 days, with who deleted them and Restore. */
export default function RecentlyDeletedKnowledge({ orgId }: Readonly<{ orgId: string }>) {
  const c = useRecentlyDeletedKnowledgeController(orgId)
  const { t } = c
  const format = useFormatter()

  const renderItem = (item: DeletedKnowledgeItemDto) => (
    <li key={`${item.kind}:${item.id}`} className="flex items-center gap-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body truncate font-medium">{item.name}</span>
        <span className="text-caption text-muted-foreground">
          {item.kind === 'knowledge_base'
            ? t('kind.base', { count: item.sourceCount })
            : t('kind.source', { base: item.knowledgeBase.name })}
        </span>
        <span className="text-caption text-muted-foreground">
          {t('deletedBy', {
            name: item.deletedBy?.name ?? t('someone'),
            date: format.dateTime(new Date(item.deletedAt), { month: 'short', day: 'numeric' }),
          })}{' '}
          · {t('daysLeft', { days: getDaysLeft(item.purgeAt, c.now) })}
        </span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        aria-label={t('restoreItem', { name: item.name })}
        isLoading={c.restoringId === item.id}
        disabled={!item.canRestore}
        onClick={() => {
          c.onRestore(item)
        }}
      >
        {t('restore')}
      </Button>
    </li>
  )

  let body
  if (c.isLoading) {
    body = (
      <div role="status" aria-label={t('loading')} className="flex flex-col gap-3">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    )
  } else if (c.errorMessage) {
    body = <ErrorState message={c.errorMessage} reference={c.errorReference} onRetry={c.refetch} />
  } else if (c.items.length === 0) {
    body = (
      <EmptyState icon={Trash2} title={t('empty.title')} description={t('empty.description')} />
    )
  } else {
    body = (
      <>
        <ul className="divide-border flex flex-col divide-y" aria-label={t('title')}>
          {c.items.map(renderItem)}
        </ul>
        <LoadMore
          label={t('loadMore')}
          hasMore={c.hasMore}
          isLoading={c.isLoadingMore}
          onLoadMore={c.onLoadMore}
        />
      </>
    )
  }

  return (
    <section aria-label={t('title')} className="flex flex-col gap-4">
      <p className="text-body text-muted-foreground">{t('description')}</p>
      {body}
      {c.renaming && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) c.onCloseRename()
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('rename.title')}</DialogTitle>
              <DialogDescription>
                {t('rename.description', { name: c.renaming.name })}
              </DialogDescription>
            </DialogHeader>
            <Form {...c.form}>
              <form noValidate onSubmit={c.onSubmitRename}>
                <DialogBody>
                  <FormField
                    control={c.form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('rename.name')}</FormLabel>
                        <FormControl>
                          <Input autoComplete="off" autoFocus {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </DialogBody>
                <DialogFooter>
                  <Button variant="secondary" type="button" onClick={c.onCloseRename}>
                    {t('rename.cancel')}
                  </Button>
                  <Button type="submit" isLoading={c.isRenaming}>
                    {t('rename.submit')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}
