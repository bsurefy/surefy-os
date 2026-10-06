// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import { useEffectiveAccess } from '@surefy/web-core/access'

import { useMe } from '../../Workspace.hooks'

export function useSidebarFooterController() {
  const t = useTranslations('workspace')
  const { data: me } = useMe()
  const { data: access } = useEffectiveAccess()

  return {
    user: me?.user,
    role: access?.role ? t(`roles.${access.role}`) : undefined,
    t,
  }
}
