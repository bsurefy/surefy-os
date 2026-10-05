// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus, UsersRound } from 'lucide-react'
import Link from 'next/link'

import type { TeamDto } from '@surefy/contracts'
import {
  DataTable,
  DataTableSearch,
  DataTableToolbar,
  EmptyState,
} from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import TeamDetail from './TeamDetail'
import DeleteTeamDialog from './TeamDialogs/DeleteTeamDialog'
import TeamFormDialog from './TeamDialogs/TeamFormDialog'
import { TEAM_DIALOG } from './TeamsSettings.constants'
import { useTeamsSettingsController } from './TeamsSettings.controller'
import { getLeadName, toSortParam } from './TeamsSettings.utils'

/** Settings › Teams: the list, the team detail panel, and create, rename and delete. */
export default function TeamsSettings() {
  const c = useTeamsSettingsController()
  const { t } = c

  const columns: DataTableColumn<TeamDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isSortable: true,
      isHideable: false,
      cell: (team) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body truncate font-medium">{team.name}</span>
          {team.description && (
            <span className="text-caption text-muted-foreground truncate">{team.description}</span>
          )}
        </div>
      ),
    },
    {
      id: 'lead',
      header: t('columns.lead'),
      cell: (team) => getLeadName(team, c.leadNames) ?? '—',
    },
    {
      id: 'members',
      header: t('columns.members'),
      align: 'end',
      cell: (team) => team.memberCount,
    },
    {
      id: 'primary',
      header: t('columns.primary'),
      align: 'end',
      cell: (team) => team.primaryMemberCount,
    },
  ]

  const emptyState = c.hasSearch ? (
    <EmptyState
      icon={UsersRound}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearSearch}
    />
  ) : (
    <EmptyState
      icon={UsersRound}
      title={t('empty.title')}
      description={t('empty.description')}
      actionLabel={c.canManage ? t('create') : undefined}
      onAction={
        c.canManage
          ? () => {
              c.openDialog({ kind: TEAM_DIALOG.CREATE })
            }
          : undefined
      }
      note={c.canManage ? undefined : t('empty.note')}
    />
  )

  const openTeam = c.teams.find((team) => team.id === c.openTeamId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          c.canManage ? (
            <Button
              icon={Plus}
              onClick={() => {
                c.openDialog({ kind: TEAM_DIALOG.CREATE })
              }}
            >
              {t('create')}
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
      </DataTableToolbar>
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
            <DataTable
              columns={columns}
              data={c.teams}
              getRowId={(team) => team.id}
              labels={{ caption: t('tableLabel') }}
              sort={toSortParam(c.filters.sort)}
              onSortChange={(next) => {
                c.onSortChange(next.desc ? `-${next.id}` : next.id)
              }}
              getRowHref={(team) => c.getTeamHref(team.id)}
              linkComponent={Link}
              isLoading={c.isLoading}
              emptyState={emptyState}
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
      {c.openTeamId && (
        <TeamDetail
          orgId={c.orgId}
          teamId={c.openTeamId}
          canManage={c.canManage}
          onClose={c.onCloseDetail}
          onEdit={() => {
            if (openTeam) c.openDialog({ kind: TEAM_DIALOG.EDIT, team: openTeam })
          }}
          onDelete={() => {
            if (openTeam) c.openDialog({ kind: TEAM_DIALOG.DELETE, team: openTeam })
          }}
        />
      )}
      {c.dialog?.kind === TEAM_DIALOG.CREATE && (
        <TeamFormDialog orgId={c.orgId} onClose={c.closeDialog} />
      )}
      {c.dialog?.kind === TEAM_DIALOG.EDIT && c.dialog.team && (
        <TeamFormDialog orgId={c.orgId} team={c.dialog.team} onClose={c.closeDialog} />
      )}
      {c.dialog?.kind === TEAM_DIALOG.DELETE && c.dialog.team && (
        <DeleteTeamDialog orgId={c.orgId} team={c.dialog.team} onClose={c.onTeamDeleted} />
      )}
    </div>
  )
}
