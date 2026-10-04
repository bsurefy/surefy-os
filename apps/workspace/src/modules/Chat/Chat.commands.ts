// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Chat module's command palette entries ("New chat"). The shell collects them in
 * `Workspace.commands.ts`; labels are full message keys (`chat.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = []
