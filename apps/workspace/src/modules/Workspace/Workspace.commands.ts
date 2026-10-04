// SPDX-License-Identifier: AGPL-3.0-only
import type { WorkspaceCommand } from './Workspace.types'

/**
 * The command palette's module entries ("Go to" settings sections, and the "Actions": New chat,
 * Create agent, Upload documents, Add API key, Invite member). Each module exports `commands`
 * from its own `index.ts`; the module skeleton spreads them in here once, and no module edits
 * this file afterwards. The sidebar entries need no command: the palette adds them itself.
 */
export const WORKSPACE_COMMANDS: readonly WorkspaceCommand[] = []
