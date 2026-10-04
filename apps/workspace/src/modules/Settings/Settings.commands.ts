// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkspaceCommand } from '@/modules/Workspace'

/**
 * The Settings module's command palette entries ("Go to" a section, "Invite member"). The shell
 * collects them in `Workspace.commands.ts`; labels are full message keys (`settings.commands.…`).
 */
export const commands: readonly WorkspaceCommand[] = []
