// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Agents module's command palette entries (Create agent). The shell collects them in
 * `Workspace.commands.ts`; labels are full message keys (`agents.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = []
