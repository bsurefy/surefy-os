// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { UserAvatar } from '@/modules/Workspace'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { Combobox } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'

import { useAdminsSectionController } from './AdminsSection.controller'

/** Install administrators. The first Owner created in setup is the first one. */
export default function AdminsSection() {
  const c = useAdminsSectionController()
  const { t } = c

  return (
    <Section title={t('title')} description={t('description')}>
      {c.errorMessage ? (
        <ErrorState
          title={t('loadError')}
          message={c.errorMessage}
          reference={c.errorReference}
          onRetry={c.refetch}
          size="sm"
        />
      ) : (
        <ul className="flex flex-col divide-y" aria-label={t('listLabel')}>
          {c.admins.map((admin) => (
            <li key={admin.user.id} className="flex items-center gap-3 py-2">
              <UserAvatar user={admin.user} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body truncate font-medium">{admin.user.name}</span>
                <span className="text-caption text-muted-foreground truncate">
                  {admin.user.email}
                </span>
              </div>
              {admin.user.id !== c.currentUserId && (
                <Button
                  variant="destructive-ghost"
                  size="sm"
                  aria-label={t('remove', { name: admin.user.name })}
                  onClick={() => {
                    c.onAskRemove(admin)
                  }}
                >
                  {t('removeShort')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex max-w-xl flex-col gap-2">
        {c.addError && <Banner tone="destructive" title={c.addError} isAnnounced />}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Combobox
              options={c.options}
              value={c.selectedUserId}
              onValueChange={c.onSelectedChange}
              aria-label={t('add')}
              labels={{
                placeholder: t('addPlaceholder'),
                search: t('addSearch'),
                empty: t('addEmpty'),
              }}
            />
          </div>
          <Button
            variant="secondary"
            isLoading={c.isAdding}
            aria-disabled={c.selectedUserId === null}
            onClick={c.onAdd}
          >
            {t('addConfirm')}
          </Button>
        </div>
      </div>
      {c.toRemove && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) c.onCloseRemove()
          }}
          tier="T2"
          tone="destructive"
          title={t('removeTitle', { name: c.toRemove.user.name })}
          description={t('removeDescription')}
          labels={{ confirm: t('removeConfirm') }}
          error={c.removeError}
          onConfirm={c.onRemove}
        />
      )}
    </Section>
  )
}
