// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Globe } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { Banner, Skeleton } from '@surefy/ui/components/Feedback'
import { SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'

import { isWebSearchOn, useWebSearchSectionController } from './WebSearchSection.controller'

/**
 * Web search allowed per team (V1): one switch per team. It sets the team's own access policy;
 * people only see the toggle in Chat when web search is also on for the organization and a search
 * provider is connected.
 */
export default function WebSearchSection() {
  const c = useWebSearchSectionController()
  const { t } = c
  const { orgSlug } = useParams<{ orgSlug: string }>()

  let body = (
    <ul aria-label={t('listLabel')} className="flex flex-col gap-4">
      {c.rows.map((row) => (
        <li key={row.team.id}>
          {row.error ? (
            <p className="text-caption text-destructive">
              {t('rowError', { team: row.team.name })}
            </p>
          ) : (
            <SwitchField
              label={row.team.name}
              description={t('rowDescription')}
              checked={isWebSearchOn(row.policy)}
              disabled={row.isLoading || c.isOrganizationOff || c.savingTeamId === row.team.id}
              onCheckedChange={(enabled) => {
                c.onToggle(row.team.id, enabled)
              }}
            />
          )}
        </li>
      ))}
    </ul>
  )
  if (c.isLoading) body = <Skeleton className="h-9 w-full max-w-sm" />
  else if (c.rows.length === 0) {
    body = <EmptyState icon={Globe} title={t('empty.title')} description={t('empty.description')} />
  }

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-4">
        {!c.hasSearchProvider && (
          <Banner
            tone="warning"
            title={t('noProviderTitle')}
            description={
              <>
                {t('noProviderDescription')}{' '}
                <Link
                  className="underline"
                  href={`${ROUTES.workspace.vault(orgSlug, 'providers')}#search-providers`}
                >
                  {t('noProviderLink')}
                </Link>
              </>
            }
          />
        )}
        {c.isOrganizationOff && (
          <Banner
            tone="info"
            title={t('organizationOffTitle')}
            description={t('organizationOffDescription')}
          />
        )}
        {body}
      </div>
    </Section>
  )
}
