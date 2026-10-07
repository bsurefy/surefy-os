// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Monitor } from 'lucide-react'

import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonRows } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'

import { useProfileSessionsController } from './ProfileSessions.controller'

/** Every device signed in to the person's account, in any SurefyOS app. */
export default function ProfileSessions() {
  const c = useProfileSessionsController()
  const { t } = c

  let content
  if (c.isLoading) content = <SkeletonRows rows={3} lines={2} rowClassName="h-12 px-0" />
  else if (c.errorMessage) {
    content = (
      <ErrorState
        size="sm"
        headingLevel={3}
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  } else {
    content = (
      <ul className="flex flex-col">
        {c.rows.map((row) => (
          <li
            key={row.id}
            className="border-border flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0"
          >
            <Monitor aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-body flex items-center gap-2 font-medium">
                {row.device}
                {row.isCurrent && <StatusPill tone="info" label={t('current')} />}
              </span>
              <span className="text-caption text-muted-foreground">{row.details}</span>
            </div>
            {!row.isCurrent && (
              <Button
                variant="ghost"
                size="sm"
                isLoading={c.revokingId === row.id}
                onClick={() => {
                  c.onRevoke(row.id)
                }}
                aria-label={t('signOutDevice', { device: row.device })}
              >
                {t('signOut')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Section
      title={t('title')}
      description={c.hasOthers ? t('description') : t('onlyThis')}
      actions={
        c.hasOthers ? (
          <Button
            variant="secondary"
            onClick={() => {
              c.setIsConfirmOpen(true)
            }}
          >
            {t('signOutOthers')}
          </Button>
        ) : undefined
      }
    >
      {content}
      <ConfirmDialog
        open={c.isConfirmOpen}
        onOpenChange={c.setIsConfirmOpen}
        tier="T2"
        tone="destructive"
        title={t('confirmTitle')}
        description={t('confirmDescription')}
        labels={{ confirm: t('signOutOthers') }}
        onConfirm={c.onConfirmRevokeOthers}
        error={c.confirmError}
      />
    </Section>
  )
}
