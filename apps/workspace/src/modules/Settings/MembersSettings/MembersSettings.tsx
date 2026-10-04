// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { UserPlus, Users } from 'lucide-react'

import { ORG_ROLES } from '@surefy/contracts'
import {
  EmptyState,
  BulkActionBar,
  DataTableSearch,
  DataTableToolbar,
} from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { SelectInput } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import MemberDialogs from './MemberDialogs'
import { MEMBER_DIALOG } from './MembersSettings.constants'
import { useMembersSettingsController } from './MembersSettings.controller'
import { useMemberRowActions } from './MembersSettings.rowActions'
import MembersTable from './MembersTable'

/** Settings › Members: people and invitations, roles, teams, and the bulk actions. */
export default function MembersSettings() {
  const c = useMembersSettingsController()
  const { t } = c
  const actions = useMemberRowActions(c.orgId)

  const emptyState = c.hasFilters ? (
    <EmptyState
      icon={Users}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState
      icon={UserPlus}
      title={t('empty.title')}
      description={t('empty.description')}
      actionLabel={c.canInvite ? t('invite.open') : undefined}
      onAction={
        c.canInvite
          ? () => {
              c.openDialog({ kind: MEMBER_DIALOG.INVITE })
            }
          : undefined
      }
      note={c.canInvite ? undefined : t('empty.note')}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          c.canInvite ? (
            <Button
              icon={UserPlus}
              onClick={() => {
                c.openDialog({ kind: MEMBER_DIALOG.INVITE })
              }}
            >
              {t('invite.open')}
            </Button>
          ) : undefined
        }
      />
      <DataTableToolbar>
        <DataTableSearch
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={c.filters.q}
          onValueChange={c.onSearchChange}
        />
        <SelectInput
          aria-label={t('filters.status')}
          options={c.statusOptions}
          value={c.filters.status}
          onValueChange={(status) => void c.onFiltersChange({ status })}
          className="w-40"
        />
        <SelectInput
          aria-label={t('filters.role')}
          options={[
            { value: 'any', label: t('filters.anyRole') },
            ...ORG_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) })),
          ]}
          value={c.filters.role ?? 'any'}
          onValueChange={(role) =>
            void c.onFiltersChange({
              role: role === 'any' ? null : role,
            })
          }
          className="w-40"
        />
        <SelectInput
          aria-label={t('filters.team')}
          options={[{ value: 'any', label: t('filters.anyTeam') }, ...c.teamOptions]}
          value={c.filters.team ?? 'any'}
          onValueChange={(team) => void c.onFiltersChange({ team: team === 'any' ? null : team })}
          className="w-44"
        />
      </DataTableToolbar>
      {c.selectedMemberIds.length > 0 && (
        <BulkActionBar
          labels={{
            selected: t('bulk.selected', { count: c.selectedMemberIds.length }),
            clear: t('bulk.clear'),
          }}
          onClear={() => {
            c.onSelectionChange({})
          }}
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              c.openDialog({ kind: MEMBER_DIALOG.BULK_ROLE })
            }}
          >
            {t('bulk.changeRole')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              c.openDialog({ kind: MEMBER_DIALOG.BULK_TEAM })
            }}
          >
            {t('bulk.addToTeam')}
          </Button>
          <Button
            variant="destructive-ghost"
            size="sm"
            onClick={() => {
              c.openDialog({ kind: MEMBER_DIALOG.BULK_DEACTIVATE })
            }}
          >
            {t('bulk.deactivate')}
          </Button>
        </BulkActionBar>
      )}
      <section aria-busy={c.isLoading || undefined}>
        {c.errorMessage ? (
          <ErrorState
            title={t('loadError')}
            message={c.errorMessage}
            reference={c.errorReference}
            onRetry={c.refetch}
          />
        ) : (
          <>
            <MembersTable
              rows={c.rows}
              isLoading={c.isLoading}
              sort={c.filters.sort}
              onSortChange={(sort) =>
                void c.onFiltersChange({ sort: sort as typeof c.filters.sort })
              }
              selection={c.selection}
              onSelectionChange={c.onSelectionChange}
              emptyState={emptyState}
              canManage={c.canManage}
              canManageAdmins={c.canManageAdmins}
              currentUserId={c.currentUserId}
              onAction={(kind, row) => {
                c.openDialog({ kind, row })
              }}
              onResend={actions.onResend}
              onCopyLink={actions.onCopyLink}
              onReactivate={actions.onReactivate}
            />
            <LoadMore
              label={t('loadMore')}
              onLoadMore={c.onLoadMore}
              isLoading={c.isLoadingMore}
              hasMore={c.hasMore}
            />
          </>
        )}
      </section>
      <MemberDialogs
        orgId={c.orgId}
        dialog={c.dialog}
        selectedMemberIds={c.selectedMemberIds}
        canManageAdmins={c.canManageAdmins}
        onClose={c.closeDialog}
      />
    </div>
  )
}
