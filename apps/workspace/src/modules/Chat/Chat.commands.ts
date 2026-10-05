// SPDX-License-Identifier: AGPL-3.0-only
import { SquarePen } from 'lucide-react'

import { ROUTES } from '@/constants/routes'

import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Chat module's command palette entries ("New chat"). The shell collects them in
 * `Workspace.commands.ts`; labels are full message keys (`chat.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = [
  {
    id: 'chat.newChat',
    group: 'actions',
    labelKey: 'chat.commands.newChat',
    icon: SquarePen,
    href: (orgSlug) => ROUTES.workspace.chat(orgSlug),
    navKey: 'chat',
  },
]
