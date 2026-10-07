// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { UserAvatar } from '@/modules/Workspace'
import { ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { Field, MultiSelect, SelectInput } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { SidePanel } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useTeamDetailController } from './TeamDetail.controller'

interface TeamDetailProps {
  orgId: string
  teamId: string
  canManage: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

/** Team detail in a side panel: members with the Primary badge, lead, and adding people. */
export default function TeamDetail({
  orgId,
  teamId,
  canManage,
  onClose,
  onEdit,
  onDelete,
}: Readonly<TeamDetailProps>) {
  const c = useTeamDetailController(orgId, teamId)
  const { t } = c

  let body
  if (c.isLoading)
    body = (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-48" />
        <SkeletonCard lines={5} />
      </div>
    )
  else if (c.errorMessage || !c.team) {
    body = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage ?? t('loadError')}
        reference={c.errorReference}
        onRetry={c.refetch}
        size="sm"
      />
    )
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <Section title={t('lead')} isPlain>
          <Field label={t('lead')} isLabelHidden>
            <SelectInput
              options={c.leadOptions}
              value={c.leadValue}
              onValueChange={c.onLeadChange}
              isDisabled={!canManage}
            />
          </Field>
        </Section>
        <Section
          title={t('members', { count: c.members.length })}
          description={t('primaryHelp', { count: c.team.primaryMemberCount })}
          isPlain
        >
          <ul className="flex flex-col divide-y">
            {c.members.map((member) => (
              <li key={member.user.id} className="flex flex-wrap items-center gap-3 py-2">
                <UserAvatar user={member.user} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body truncate font-medium">{member.user.name}</span>
                  <span className="text-caption text-muted-foreground truncate">
                    {member.user.email}
                  </span>
                </div>
                {member.isLead && (
                  <span className="bg-surface-2 text-label rounded-md px-1.5 py-0.5">
                    {t('leadBadge')}
                  </span>
                )}
                {member.isPrimary && (
                  <span className="bg-info-soft text-info-soft-foreground text-label rounded-md px-1.5 py-0.5">
                    {t('primaryBadge')}
                  </span>
                )}
                {canManage && (
                  <div className="flex gap-1">
                    {c.canMakePrimary(member.user.id, member.isPrimary) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          c.onMakePrimary(member.user.id, member.user.name)
                        }}
                      >
                        {t('makePrimary')}
                      </Button>
                    )}
                    <Button
                      variant="destructive-ghost"
                      size="sm"
                      aria-label={t('removeMember', { name: member.user.name })}
                      onClick={() => {
                        c.onRemove(member.user.id, member.user.name)
                      }}
                    >
                      {t('remove')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {c.members.length === 0 && (
            <p className="text-body text-muted-foreground">{t('noMembers')}</p>
          )}
        </Section>
        {canManage && (
          <Section title={t('add')} isPlain>
            <div className="flex flex-col gap-2">
              <Field label={t('add')} isLabelHidden>
                <MultiSelect
                  options={c.addOptions}
                  value={c.toAdd}
                  onValueChange={c.onToAddChange}
                  labels={{
                    placeholder: t('addPlaceholder'),
                    search: t('addSearch'),
                    empty: t('addEmpty'),
                    remove: (label) => t('removeChip', { label }),
                    more: (count) => t('more', { count }),
                  }}
                />
              </Field>
              <Button
                variant="secondary"
                className="self-start"
                isLoading={c.isAdding}
                aria-disabled={c.toAdd.length === 0}
                onClick={c.toAdd.length > 0 ? c.onAdd : undefined}
              >
                {t('addConfirm', { count: c.toAdd.length })}
              </Button>
            </div>
          </Section>
        )}
      </div>
    )
  }

  return (
    <SidePanel
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={c.team?.name ?? t('title')}
      description={c.team?.description ?? undefined}
      size="lg"
      footer={
        canManage && c.team ? (
          <div className="flex w-full justify-between">
            <Button variant="destructive-ghost" onClick={onDelete}>
              {t('delete')}
            </Button>
            <Button variant="secondary" onClick={onEdit}>
              {t('edit')}
            </Button>
          </div>
        ) : undefined
      }
    >
      {body}
    </SidePanel>
  )
}
