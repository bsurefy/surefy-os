// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Guard module's command palette entries. The shell collects them in `Workspace.commands.ts`;
 * labels are full message keys (`guard.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = []
