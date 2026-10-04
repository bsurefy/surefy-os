// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Vault module's command palette entries ("Add API key"). The shell collects them in
 * `Workspace.commands.ts`; labels are full message keys (`vault.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = []
