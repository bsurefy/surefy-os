// SPDX-License-Identifier: AGPL-3.0-only
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import type { SetupChecklistItem } from '@surefy/contracts'

/** Where each checklist item is done. Items of modules not yet available never reach the screen. */
export const CHECKLIST_LINKS: Record<SetupChecklistItem, (orgSlug: string) => string> = {
  'connect-model': (orgSlug) => ROUTES.workspace.vault(orgSlug),
  'add-documents': (orgSlug) => ROUTES.workspace.knowledge(orgSlug),
  'invite-team': (orgSlug) => ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.MEMBERS),
  'create-agent': (orgSlug) => ROUTES.workspace.agentNew(orgSlug),
  'set-budget': (orgSlug) => ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.USAGE),
}
