// SPDX-License-Identifier: AGPL-3.0-only
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { FEATURES } from '@surefy/contracts'
import { useFeatureStatus } from '@surefy/web-core/access'

import { WORKSPACE_NAV } from '../../Workspace.constants'
import { useMe } from '../../Workspace.hooks'
import { getFeatureEdition } from '../../Workspace.labels'
import { getSwitchOrgHref } from '../../Workspace.utils'

import type { CreateOrganizationMode, OrgSwitcherProps } from './OrgSwitcher.types'

/**
 * The organizations the person belongs to (navigation.md §3). Community holds one organization,
 * so "Create organization" opens the multi-organization upgrade card; where the feature is
 * available it is offered only when the install's limit and policy allow it.
 */
export function useOrgSwitcherController({ orgSlug }: Pick<OrgSwitcherProps, 'orgSlug'>) {
  const t = useTranslations('workspace.org')
  const tRoles = useTranslations('workspace.roles')
  const tEditions = useTranslations('editions.edition')
  const pathname = usePathname()
  const { data: me } = useMe()
  const multiOrganization = useFeatureStatus(FEATURES.MULTI_ORGANIZATION)

  const memberships = me?.memberships ?? []
  const options = memberships.map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    role: tRoles(membership.role),
    href: getSwitchOrgHref(pathname, membership.organization.slug, WORKSPACE_NAV),
    isCurrent: membership.organization.slug === orgSlug,
  }))

  let createMode: CreateOrganizationMode = 'hidden'
  if (multiOrganization === 'unavailable') createMode = 'upgrade'
  else if (multiOrganization !== 'pending' && me?.canCreateOrganization === true) {
    createMode = 'create'
  }

  return {
    options,
    createMode,
    upgradeEdition: tEditions(getFeatureEdition(FEATURES.MULTI_ORGANIZATION)),
    t,
  }
}
