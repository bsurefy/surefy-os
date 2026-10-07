// SPDX-License-Identifier: AGPL-3.0-only
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { useEffectiveAccess } from '@surefy/web-core/access'

import { useMe } from '../Workspace.hooks'
import { getHomeHref } from '../Workspace.utils'

import type { NoAccessArea } from '../Workspace.types'

export function useNoAccessStateController({ area }: { area: NoAccessArea }) {
  const t = useTranslations('workspace.noAccess')
  const tRoles = useTranslations('workspace.roles')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const { data: me } = useMe()
  const { data: access } = useEffectiveAccess()

  const areaName = t(`areas.${area}`)
  const organization = me?.memberships.find(
    (membership) => membership.organization.slug === orgSlug,
  )?.organization.name
  const explanation =
    access?.role && organization
      ? t('roleLine', { role: tRoles(access.role), organization })
      : t('noRoleLine')

  return {
    title: t('title', { area: areaName }),
    explanation,
    askAdmin: t('askAdmin', { area: areaName }),
    homeHref: getHomeHref(orgSlug),
    homeLabel: t('goHome'),
  }
}
