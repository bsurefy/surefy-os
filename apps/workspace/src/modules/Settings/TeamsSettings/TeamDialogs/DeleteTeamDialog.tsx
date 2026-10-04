// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { teamQueries, useDeleteTeamMutation } from '@/api/teams'
import { TEAM_CONNECTIONS_ACTIONS } from '@surefy/contracts'
import type { TeamConnectionsAction, TeamDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Label } from '@surefy/ui/primitives/label'
import { RadioGroup, RadioGroupItem } from '@surefy/ui/primitives/radio-group'
import { getErrorMessage } from '@surefy/web-core/errors'

import { needsConnectionsDecision } from '../TeamsSettings.utils'

/**
 * Delete a team (T3: typed name): says who loses what they had only through this team, who stops
 * being charged to a team, and what happens to the team's connections.
 */
export default function DeleteTeamDialog({
  orgId,
  team,
  onClose,
}: Readonly<{ orgId: string; team: TeamDto; onClose: () => void }>) {
  const t = useTranslations('settings.teams.delete')
  const tErrors = useTranslations('errors')
  const impact = useQuery(teamQueries.deletionImpact(orgId, team.id))
  const remove = useDeleteTeamMutation(orgId, { silent: true })
  const [connections, setConnections] = useState<TeamConnectionsAction | undefined>()
  const [isMissingDecision, setIsMissingDecision] = useState(false)
  const mustDecide = needsConnectionsDecision(impact.data)

  const lines: React.ReactNode[] = []
  if (impact.data) {
    lines.push(t('impactMembers', { count: impact.data.memberCount }))
    if (impact.data.primaryMemberCount > 0) {
      lines.push(t('impactPrimary', { count: impact.data.primaryMemberCount }))
    }
    for (const dependent of impact.data.dependents) {
      lines.push(t('impactDependent', { type: dependent.type, count: dependent.count }))
    }
    if (mustDecide) {
      lines.push(
        <fieldset key="connections" className="flex flex-col gap-2">
          <legend className="text-label mb-1">
            {t('connections', { count: impact.data.connectionCount })}
          </legend>
          <RadioGroup
            value={connections}
            onValueChange={(value) => {
              setConnections(value as TeamConnectionsAction)
            }}
          >
            {TEAM_CONNECTIONS_ACTIONS.map((action) => (
              <div key={action} className="flex items-center gap-2">
                <RadioGroupItem id={`team-connections-${action}`} value={action} />
                <Label htmlFor={`team-connections-${action}`}>
                  {t(`connectionsAction.${action}`)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>,
      )
    }
  }

  const error = remove.error ?? impact.error
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('title', { name: team.name })}
      description={t('description')}
      impact={lines}
      labels={{ confirm: t('confirm') }}
      error={
        error
          ? getErrorMessage(error, tErrors)
          : (isMissingDecision && t('connectionsRequired')) || undefined
      }
      onConfirm={async () => {
        if (!impact.data) throw new Error('The impact is not loaded yet')
        if (mustDecide && !connections) {
          setIsMissingDecision(true)
          throw new Error('Choose what happens to the connections')
        }
        await remove.mutateAsync({ teamId: team.id, connections })
        toast.success(t('deleted', { name: team.name }))
      }}
    />
  )
}
