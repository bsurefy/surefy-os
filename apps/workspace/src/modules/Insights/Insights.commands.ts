// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Insights module's command palette entries. The shell collects them in
 * `Workspace.commands.ts`; labels are full message keys (`insights.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = []
