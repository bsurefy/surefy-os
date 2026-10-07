// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { Section } from '@surefy/ui/components/Layout'
import { useEffectiveAccess } from '@surefy/web-core/access'

/** "Your access": the person's role and teams in this organization. */
export default function ProfileAccess({ organization }: Readonly<{ organization: string }>) {
  const t = useTranslations('workspace')
  const { data: access } = useEffectiveAccess()
  const rows = [
    { id: 'organization', label: t('profile.access.organization'), value: organization },
    {
      id: 'role',
      label: t('profile.access.role'),
      value: access?.role ? t(`roles.${access.role}`) : t('profile.access.noRole'),
    },
    {
      id: 'teams',
      label: t('profile.access.teams'),
      value: t('profile.access.teamCount', { count: access?.teamIds.length ?? 0 }),
    },
  ]

  return (
    <Section title={t('profile.access.title')} description={t('profile.access.description')}>
      <dl className="grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-0.5">
            <dt className="text-caption text-muted-foreground">{row.label}</dt>
            <dd className="text-body font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}
