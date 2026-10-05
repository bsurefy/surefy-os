// SPDX-License-Identifier: AGPL-3.0-only
import { BookPlus } from 'lucide-react'

import { ROUTES } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'

import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Knowledge module's command palette entries ("New knowledge base"). The shell collects them
 * in `Workspace.commands.ts`; labels are full message keys (`knowledge.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = [
  {
    id: 'knowledge.create',
    group: 'actions',
    labelKey: 'knowledge.commands.create',
    icon: BookPlus,
    href: (orgSlug) => `${ROUTES.workspace.knowledge(orgSlug)}?create=1`,
    navKey: 'knowledge',
    anyPermission: [PERMISSIONS.KNOWLEDGE_UPLOAD],
  },
]
