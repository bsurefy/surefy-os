// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { GuardRuleRowDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { Banner } from '@surefy/ui/components/Feedback'
import { SidePanel } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'

/** Where a rule that is edited elsewhere is edited. */
function getEditHref(row: GuardRuleRowDto, orgSlug: string): string | null {
  const target = row.editTarget
  if (!target) return null
  switch (target.type) {
    case 'agent':
      return target.id ? ROUTES.workspace.agent(orgSlug, target.id, 'guard') : null
    case 'flow':
      return target.id ? ROUTES.workspace.flow(orgSlug, target.id) : null
    case 'data_filters':
      return ROUTES.workspace.guard(orgSlug, 'data-filters')
  }
}

/**
 * A rule the Guardrails table lists but does not edit: an agent's or flow's own rule, or a
 * personal-data filter. It opens read-only with a link to where it is changed.
 */
export default function RuleSummary({
  row,
  onClose,
}: Readonly<{ row: GuardRuleRowDto; onClose: () => void }>) {
  const t = useTranslations('guard.guardrails')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const href = getEditHref(row, orgSlug)
  const kind = row.editTarget?.type ?? 'agent'
  const scope =
    row.scope === 'team' && row.team
      ? t('scopeTeam', { team: row.team.name })
      : t(`scopes.${row.scope}`)

  return (
    <SidePanel
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={row.name}
      description={t(`types.${row.type}`)}
      footer={
        <Button type="button" variant="secondary" className="ml-auto" onClick={onClose}>
          {t('sheet.close')}
        </Button>
      }
    >
      <Banner
        tone="info"
        title={t(`sheet.summary.${kind}.title`)}
        description={t(`sheet.summary.${kind}.description`)}
        action={
          href && (
            <Button size="sm" variant="secondary" asChild>
              <Link href={toRoute(href)}>{t(`sheet.summary.${kind}.open`)}</Link>
            </Button>
          )
        }
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <dt className="text-label text-foreground-secondary">{t('sheet.summary.scope')}</dt>
        <dd className="text-body">{scope}</dd>
        <dt className="text-label text-foreground-secondary">{t('sheet.summary.usedBy')}</dt>
        <dd className="text-body">{t('usedBy', { count: row.usedByCount })}</dd>
        <dt className="text-label text-foreground-secondary">{t('sheet.summary.triggered')}</dt>
        <dd className="text-body">{row.triggeredThisWeek}</dd>
        <dt className="text-label text-foreground-secondary">{t('sheet.summary.status')}</dt>
        <dd>
          <StatusPill
            label={row.isEnabled ? t('filters.on') : t('filters.off')}
            tone={row.isEnabled ? 'success' : 'neutral'}
          />
        </dd>
      </dl>
    </SidePanel>
  )
}
