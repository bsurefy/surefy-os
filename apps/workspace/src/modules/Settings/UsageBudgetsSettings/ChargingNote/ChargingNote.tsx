// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Info } from 'lucide-react'
import Link from 'next/link'

import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'

import { useChargingNoteController } from './ChargingNote.controller'

/**
 * Who is charged: a person's usage counts against their own limit, their primary team's budget
 * and the organization budget, with people in several teams as examples and a link to Members,
 * where the primary team is changed.
 */
export default function ChargingNote({
  orgId,
  orgSlug,
}: Readonly<{ orgId: string; orgSlug: string }>) {
  const { examples, t } = useChargingNoteController({ orgId })
  return (
    <div className="bg-surface-2 flex gap-3 rounded-lg p-4">
      <Info aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="text-body flex flex-col gap-2">
        <p>{t('rule')}</p>
        <p className="text-muted-foreground">{t('withoutPerson')}</p>
        {examples.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {examples.map((example) => (
              <li key={example.userId}>
                {example.primaryTeam
                  ? t('example', {
                      name: example.name,
                      teams: example.teamList,
                      primary: example.primaryTeam,
                    })
                  : t('exampleNoPrimary', { name: example.name, teams: example.teamList })}
              </li>
            ))}
          </ul>
        )}
        <Link
          href={toRoute(ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.MEMBERS))}
          className="text-primary underline-offset-4 hover:underline"
        >
          {t('changeLink')}
        </Link>
      </div>
    </div>
  )
}
