// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import { useMe } from '../../Workspace.hooks'

export function useSidebarFooterController(orgSlug: string) {
  const t = useTranslations('workspace')
  const { data: me } = useMe()
  const organization = me?.memberships.find(
    (membership) => membership.organization.slug === orgSlug,
  )?.organization

  return { user: me?.user, organizationName: organization?.name, t }
}
