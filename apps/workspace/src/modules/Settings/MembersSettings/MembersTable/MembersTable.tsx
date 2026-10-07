// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Ellipsis } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import { UserAvatar } from '@/modules/Workspace'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import { MEMBER_DIALOG } from '../MembersSettings.constants'
import { getRowStatus, toSortParam } from '../MembersSettings.utils'
import { canChangeMember } from './MembersTable.utils'

import type { MemberRow } from '../MembersSettings.types'
import type { MembersTableProps } from './MembersTable.types'

const STATUS_TONE = {
  active: 'success',
  deactivated: 'neutral',
  invited: 'info',
  notDelivered: 'warning',
} as const

/** The Members table: people and pending invitations, with the row menu and bulk selection. */
export default function MembersTable({
  rows,
  isLoading,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  emptyState,
  onAction,
  onResend,
  onCopyLink,
  onReactivate,
  ...permissions
}: Readonly<MembersTableProps>) {
  const t = useTranslations('settings.members')
  const format = useFormatter()

  const columns: DataTableColumn<MemberRow>[] = [
    {
      id: 'name',
      header: t('columns.person'),
      isSortable: true,
      isHideable: false,
      cell: (row) =>
        row.kind === 'member' ? (
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar user={row.member.user} size="sm" />
            <div className="flex min-w-0 flex-col">
              <span className="text-body truncate font-medium">{row.member.user.name}</span>
              <span className="text-caption text-muted-foreground truncate">
                {row.member.user.email}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col">
            <span className="text-body truncate font-medium">{row.invitation.email}</span>
            <span className="text-caption text-muted-foreground truncate">
              {row.invitation.invitedBy
                ? t('invitedBy', { name: row.invitation.invitedBy.name })
                : t('invited')}
            </span>
          </div>
        ),
    },
    {
      id: 'role',
      header: t('columns.role'),
      cell: (row) => t(`roles.${row.kind === 'member' ? row.member.role : row.invitation.role}`),
    },
    {
      id: 'teams',
      header: t('columns.teams'),
      cell: (row) => {
        const teams = row.kind === 'member' ? row.member.teams : row.invitation.teams
        if (teams.length === 0) return <span className="text-muted-foreground">{t('noTeams')}</span>
        const primary = row.kind === 'member' ? row.member.primaryTeamId : null
        return (
          <span className="flex flex-wrap gap-1">
            {teams.map((team) => (
              <span
                key={team.id}
                className="bg-surface-2 text-label rounded-md px-1.5 py-0.5"
                title={team.id === primary ? t('primaryTeam') : undefined}
              >
                {team.name}
                {team.id === primary && <span className="sr-only"> ({t('primaryTeam')})</span>}
                {team.id === primary && (
                  <span aria-hidden className="text-muted-foreground">
                    {' '}
                    ★
                  </span>
                )}
              </span>
            ))}
          </span>
        )
      },
    },
    {
      id: 'signIn',
      header: t('columns.signIn'),
      cell: (row) =>
        row.kind === 'member' ? t(`signInMethod.${row.member.signInMethod.type}`) : '—',
    },
    {
      id: 'twoFactor',
      header: t('columns.twoFactor'),
      cell: (row) => {
        if (row.kind !== 'member') return '—'
        return row.member.twoFactorEnabled ? t('on') : t('off')
      },
    },
    {
      id: 'lastActiveAt',
      header: t('columns.lastActive'),
      isSortable: true,
      cell: (row) =>
        row.kind === 'member' && row.member.lastActiveAt
          ? format.relativeTime(new Date(row.member.lastActiveAt))
          : '—',
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (row) => {
        const status = getRowStatus(row)
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusPill label={t(`rowStatus.${status}`)} tone={STATUS_TONE[status]} />
            {status === 'notDelivered' && row.kind === 'invitation' && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  onCopyLink(row.invitation.id)
                }}
              >
                {t('copyInviteLink')}
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  const rowActions = (row: MemberRow) => {
    if (row.kind === 'invitation') {
      if (!permissions.canManage) return null
      return (
        <RowMenu label={t('rowActions', { name: row.invitation.email })}>
          <DropdownMenuItem
            onSelect={() => {
              onResend(row.invitation.id)
            }}
          >
            {t('actions.resend')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onCopyLink(row.invitation.id)
            }}
          >
            {t('actions.copyLink')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              onAction(MEMBER_DIALOG.REVOKE_INVITATION, row)
            }}
          >
            {t('actions.revoke')}
          </DropdownMenuItem>
        </RowMenu>
      )
    }
    if (!canChangeMember(row, permissions)) return null
    const { member } = row
    return (
      <RowMenu label={t('rowActions', { name: member.user.name })}>
        <DropdownMenuItem
          onSelect={() => {
            onAction(MEMBER_DIALOG.CHANGE_ROLE, row)
          }}
        >
          {t('actions.changeRole')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={member.teams.length < 2}
          onSelect={() => {
            onAction(MEMBER_DIALOG.PRIMARY_TEAM, row)
          }}
        >
          {t('actions.changePrimaryTeam')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {member.status === 'active' ? (
          <DropdownMenuItem
            onSelect={() => {
              onAction(MEMBER_DIALOG.DEACTIVATE, row)
            }}
          >
            {t('actions.deactivate')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => {
              onReactivate(member.id)
            }}
          >
            {t('actions.reactivate')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => {
            onAction(MEMBER_DIALOG.REMOVE, row)
          }}
        >
          {t('actions.remove')}
        </DropdownMenuItem>
      </RowMenu>
    )
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      labels={{
        caption: t('tableLabel'),
        actions: t('columns.actions'),
        selectAll: t('selectAll'),
        selectRow: (rowId) => t('selectRow', { id: rowId }),
      }}
      sort={toSortParam(sort)}
      onSortChange={(next) => {
        onSortChange(next.desc ? `-${next.id}` : next.id)
      }}
      selection={permissions.canManage ? selection : undefined}
      onSelectionChange={permissions.canManage ? onSelectionChange : undefined}
      rowActions={permissions.canManage ? rowActions : undefined}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}

function RowMenu({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
