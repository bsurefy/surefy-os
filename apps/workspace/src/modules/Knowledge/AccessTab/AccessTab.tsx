// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { History, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { KNOWLEDGE_ACCESS_LEVELS, KNOWLEDGE_AUDIT_ACTIONS } from '@surefy/contracts'
import type { KnowledgeBaseDto, KnowledgeAccessLevel } from '@surefy/contracts'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { Combobox, SelectInput } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Label } from '@surefy/ui/primitives/label'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useAccessTabController } from './AccessTab.controller'
import RemoveTeamAccessDialog from './RemoveTeamAccessDialog'

import type { TeamLevel } from './AccessTab.controller'

const TEAM_LEVELS: TeamLevel[] = ['none', ...KNOWLEDGE_ACCESS_LEVELS]

/**
 * Knowledge base › Access: teams (No access, Can search, Can manage), people as exceptions, and for
 * "Local models only" bases the agents it blocks. Removing a team's access is T2.
 */
export default function AccessTab({ base }: Readonly<{ base: KnowledgeBaseDto }>) {
  const c = useAccessTabController(base)
  const { t } = c
  const { orgSlug } = useParams<{ orgSlug: string }>()

  if (c.isLoading) {
    return (
      <div role="status" aria-label={t('loading')} className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (c.errorMessage) {
    return (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {c.isLocalOnly && (
        <Banner
          tone="info"
          title={t('localOnly.title')}
          description={
            c.blockedAgents.length > 0
              ? t('localOnly.blocked', {
                  names: c.blockedAgents.map((agent) => agent.name).join(', '),
                })
              : t('localOnly.description')
          }
        />
      )}
      <section aria-labelledby="access-teams" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="access-teams" className="text-section-title">
            {t('teams.title')}
          </h2>
          <p className="text-body text-muted-foreground">{t('teams.description')}</p>
        </div>
        {c.teams.length === 0 ? (
          <p className="text-body text-muted-foreground">{t('teams.empty')}</p>
        ) : (
          <ul className="divide-border border-border flex flex-col divide-y rounded-lg border">
            {c.teams.map(({ team, level }) => (
              <li key={team.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-body font-medium">{team.name}</span>
                <SelectInput<TeamLevel>
                  aria-label={t('teams.levelFor', { team: team.name })}
                  options={TEAM_LEVELS.map((value) => ({ value, label: t(`levels.${value}`) }))}
                  value={level}
                  isDisabled={c.isSaving}
                  onValueChange={(next) => {
                    c.onTeamLevelChange(team, next)
                  }}
                  className="w-44"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="access-people" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="access-people" className="text-section-title">
            {t('people.title')}
          </h2>
          <p className="text-body text-muted-foreground">{t('people.description')}</p>
        </div>
        {c.personGrants.length > 0 && (
          <ul className="divide-border border-border flex flex-col divide-y rounded-lg border">
            {c.personGrants.map((grant) => (
              <li key={grant.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-body truncate font-medium">{grant.user?.name}</span>
                  <span className="text-caption text-muted-foreground truncate">
                    {grant.user?.email}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <SelectInput<KnowledgeAccessLevel>
                    aria-label={t('people.levelFor', { name: grant.user?.name ?? '' })}
                    options={KNOWLEDGE_ACCESS_LEVELS.map((value) => ({
                      value,
                      label: t(`levels.${value}`),
                    }))}
                    value={grant.level}
                    isDisabled={c.isSaving}
                    onValueChange={(next) => {
                      if (grant.user) c.onPersonLevelChange(grant.user.id, next)
                    }}
                    className="w-44"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('people.remove', { name: grant.user?.name ?? '' })}
                    onClick={() => {
                      if (grant.user) c.onRemovePerson(grant.user.id)
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Label htmlFor="access-add-person" className="sr-only">
              {t('people.placeholder')}
            </Label>
            <Combobox
              id="access-add-person"
              options={c.memberOptions}
              value={c.personToAdd || null}
              onValueChange={c.onPersonToAddChange}
              labels={{
                placeholder: t('people.placeholder'),
                search: t('people.search'),
                empty: t('people.empty'),
              }}
            />
          </div>
          <SelectInput<KnowledgeAccessLevel>
            aria-label={t('people.levelToAdd')}
            options={KNOWLEDGE_ACCESS_LEVELS.map((value) => ({
              value,
              label: t(`levels.${value}`),
            }))}
            value={c.levelToAdd}
            onValueChange={c.onLevelToAddChange}
            className="w-44"
          />
          <Button
            variant="secondary"
            icon={Plus}
            disabled={!c.personToAdd}
            isLoading={c.isSaving}
            onClick={() => void c.onAddPerson()}
          >
            {t('people.add')}
          </Button>
        </div>
      </section>
      {c.canReadAudit && (
        <Button asChild variant="ghost" className="self-start">
          <Link
            href={toRoute(
              `${ROUTES.workspace.guard(orgSlug, 'audit-log')}?action=${KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_BASE_ACCESS_CHANGED}`,
            )}
          >
            <History aria-hidden />
            {t('history')}
          </Link>
        </Button>
      )}
      {c.removingTeam && (
        <RemoveTeamAccessDialog
          orgId={c.orgId}
          baseId={base.id}
          team={c.removingTeam}
          onConfirm={() => c.onRemoveTeamAccess(c.removingTeam?.id ?? '')}
          onClose={c.onCloseRemoveTeam}
        />
      )}
    </div>
  )
}
