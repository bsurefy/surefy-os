// SPDX-License-Identifier: AGPL-3.0-only
// Each module's commands file itself, not its entry: module entries import the shell's exports,
// which would make an import cycle through this file
import { commands as chatCommands } from '@/modules/Chat/Chat.commands'
import { commands as guardCommands } from '@/modules/Guard/Guard.commands'
import { commands as insightsCommands } from '@/modules/Insights/Insights.commands'
import { commands as knowledgeCommands } from '@/modules/Knowledge/Knowledge.commands'
import { commands as settingsCommands } from '@/modules/Settings/Settings.commands'
import { commands as vaultCommands } from '@/modules/Vault/Vault.commands'

import type { WorkspaceCommand } from './Workspace.types'

/**
 * The command palette's module entries ("Go to" settings sections, and the "Actions": New chat,
 * Create agent, Upload documents, Add API key, Invite member). Each module exports `commands`
 * from its own `index.ts`; the module skeleton spreads them in here once, and no module edits
 * this file afterwards. The sidebar entries need no command: the palette adds them itself.
 */
export const WORKSPACE_COMMANDS: readonly WorkspaceCommand[] = [
  ...chatCommands,
  ...knowledgeCommands,
  ...vaultCommands,
  ...settingsCommands,
  ...insightsCommands,
  ...guardCommands,
]
