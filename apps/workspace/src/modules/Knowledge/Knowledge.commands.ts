// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Knowledge module's command palette entries ("Upload documents"). The shell collects them in
 * `Workspace.commands.ts`; labels are full message keys (`knowledge.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = []
