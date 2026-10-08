// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Tabs } from '@surefy/ui/components/Navigation'
import { hasPermission, useEffectiveAccess } from '@surefy/web-core/access'

import { GUARD_TABS } from './GuardTabs.constants'

import type { GuardTabValue } from './GuardTabs.constants'

/**
 * The tabs of every Guard page. A person sees the tabs they may open: Builders read the rules
 * that apply to their agents, the audit log is for Admins and Owners.
 */
export default function GuardTabs({ active }: Readonly<{ active: GuardTabValue }>) {
  const t = useTranslations('guard.tabs')
  const params = useParams<{ orgSlug: string }>()
  const { data: access } = useEffectiveAccess()

  const visible = GUARD_TABS.filter(
    (tab) => tab.released && access && hasPermission(access, tab.permission),
  )
  // a single tab is no navigation
  if (visible.length < 2) return null

  const items = visible.map((tab) => ({
    value: tab.value,
    label: t(tab.value),
    href: toRoute(ROUTES.workspace.guard(params.orgSlug, tab.value)),
  }))
  return <Tabs label={t('label')} items={items} value={active} linkComponent={Link} />
}
