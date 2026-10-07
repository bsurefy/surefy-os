// SPDX-License-Identifier: AGPL-3.0-only
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'
import { useCan } from '@surefy/web-core/access'

import { VAULT_TABS } from '../Vault.constants'
import { getVaultTab } from '../Vault.utils'

/** Settings › Vault: the open tab (from the route), the tab list, and whether the person manages the Vault. */
export function useVaultSettingsController() {
  const t = useTranslations('vault')
  const { orgSlug, tab } = useParams<{ orgSlug: string; tab?: string }>()
  const canManage = useCan(PERMISSIONS.VAULT_MANAGE)
  const activeTab = getVaultTab(tab)

  return {
    t,
    canManage,
    activeTab,
    tabs: VAULT_TABS.map((value) => ({
      value,
      label: t(`tabs.${value}`),
      href: ROUTES.workspace.vault(orgSlug, value),
    })),
  }
}
