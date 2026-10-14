// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { User, Users, X } from 'lucide-react'
import { useId } from 'react'

import type { ChatShareDto } from '@surefy/contracts'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { MultiSelect } from '@surefy/ui/components/Forms'
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
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useShareDialogController } from './ShareDialog.controller'

import type { ShareDialogController } from './ShareDialog.controller'

export interface ShareDialogProps {
  orgId: string
  chatId: string
  title: string
  isPrivate: boolean
  onClose: () => void
}

/** One person or team with access, and the way to take it back. */
function ShareRow({ share, c }: Readonly<{ share: ChatShareDto; c: ShareDialogController }>) {
  const { t } = c
  const name = share.team?.name ?? share.user?.name ?? t('unknown')
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className="bg-surface-2 text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
        {share.team ? (
          <Users aria-hidden className="size-3.5" />
        ) : (
          <User aria-hidden className="size-3.5" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-label truncate font-medium">{name}</span>
        <span className="text-caption text-muted-foreground truncate">
          {share.team
            ? t('teamMembers', { count: share.team.memberCount })
            : (share.user?.email ?? '')}
        </span>
      </span>
      <span className="text-caption text-muted-foreground shrink-0">{t('viewOnly')}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('remove', { name })}
        isLoading={c.removingId === share.id}
        onClick={() => {
          c.onRemove(share.id)
        }}
      >
        <X aria-hidden />
      </Button>
    </li>
  )
}

/**
 * Share a chat with people or teams of the organization (chat.md §2, §3): they can read it, view
 * only, and nobody outside the organization can open it.
 */
export default function ShareDialog({
  orgId,
  chatId,
  title,
  isPrivate,
  onClose,
}: Readonly<ShareDialogProps>) {
  const c = useShareDialogController(orgId, chatId, isPrivate)
  const { t, shares } = c
  const accessId = useId()
  const list = shares.data?.shares ?? []

  let body
  if (isPrivate) {
    body = <Banner tone="info" title={t('private.title')} description={t('private.description')} />
  } else if (shares.isPending) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  } else if (shares.isError) {
    body = (
      <ErrorState
        size="sm"
        headingLevel={3}
        message={c.loadError ?? ''}
        reference={c.loadErrorReference}
        onRetry={() => void shares.refetch()}
      />
    )
  } else if (!c.sharingEnabled) {
    body = (
      <Banner tone="info" title={t('disabled.title')} description={t('disabled.description')} />
    )
  } else {
    body = (
      <>
        <div className="flex flex-col gap-1.5">
          <MultiSelect
            options={c.picker.options}
            value={c.picker.value}
            onValueChange={c.picker.onValueChange}
            onSearchChange={c.picker.onSearchChange}
            isLoading={c.picker.isLoading}
            labels={{
              placeholder: t('picker.placeholder'),
              search: t('picker.search'),
              empty: t('picker.empty'),
              loading: t('picker.loading'),
              remove: (label: string) => t('picker.remove', { name: label }),
              more: (count: number) => t('picker.more', { count }),
            }}
            aria-label={t('picker.label')}
          />
          <p className="text-caption text-muted-foreground">{t('note')}</p>
        </div>
        <section aria-labelledby={accessId} className="flex flex-col gap-1">
          <h3 id={accessId} className="text-overline text-muted-foreground">
            {list.length > 0
              ? t('access.title', { count: shares.data.peopleWithAccess })
              : t('access.none')}
          </h3>
          {list.length > 0 && (
            <ul className="divide-border flex flex-col divide-y">
              {list.map((share) => (
                <ShareRow key={share.id} share={share} c={c} />
              ))}
            </ul>
          )}
        </section>
      </>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { title })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">{body}</DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {c.canShare ? t('cancel') : t('close')}
          </Button>
          {c.canShare && (
            <Button
              onClick={c.onShare}
              isLoading={c.isSharing}
              disabled={c.picker.value.length === 0}
            >
              {t('share')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
