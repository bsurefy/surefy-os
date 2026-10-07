// SPDX-License-Identifier: AGPL-3.0-only
import { KeyRound } from 'lucide-react'

import { ROUTES } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'

import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Vault module's command palette entries ("Add API key"). The shell collects them in
 * `Workspace.commands.ts`; labels are full message keys (`vault.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = [
  {
    id: 'vault.addKey',
    group: 'actions',
    labelKey: 'vault.commands.addKey',
    icon: KeyRound,
    href: (orgSlug) => `${ROUTES.workspace.vault(orgSlug, 'providers')}?add=key`,
    navKey: 'settings',
    anyPermission: [PERMISSIONS.VAULT_MANAGE],
  },
]
