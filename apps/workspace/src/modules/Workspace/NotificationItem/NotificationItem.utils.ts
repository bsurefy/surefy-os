// SPDX-License-Identifier: AGPL-3.0-only
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import type { NotificationDto, NotificationTargetType } from '@surefy/contracts'

type Target = NonNullable<NotificationDto['target']>

const TARGET_HREFS = {
  approval: (orgSlug, id) => ROUTES.workspace.approval(orgSlug, id),
  invitation: (orgSlug) => ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.MEMBERS),
  vault_model: (orgSlug) => ROUTES.workspace.vault(orgSlug),
  vault_credential: (orgSlug) => ROUTES.workspace.vault(orgSlug),
  knowledge_source: (orgSlug) => ROUTES.workspace.knowledge(orgSlug),
  export: (orgSlug) => ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.DATA_PRIVACY),
  data_request: (orgSlug) => ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.DATA_PRIVACY),
  organization: (orgSlug) => ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.DATA_PRIVACY),
  budget: (orgSlug) => ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.USAGE),
  chat: (orgSlug, id) => ROUTES.workspace.chat(orgSlug, id),
  connection: (orgSlug) => ROUTES.workspace.pieces(orgSlug),
  flow: (orgSlug, id) => ROUTES.workspace.flow(orgSlug, id),
  piece: (orgSlug, id) => ROUTES.workspace.piece(orgSlug, id),
  evaluation_run: (orgSlug) => ROUTES.workspace.train(orgSlug),
  training_job: (orgSlug, id) => ROUTES.workspace.trainJob(orgSlug, id),
  access_grant: (orgSlug) => ROUTES.workspace.guard(orgSlug),
} as const satisfies Record<NotificationTargetType, (orgSlug: string, id: string) => string>

/**
 * Where a notification leads: the object's page, or the page that manages it when the target
 * has no page of its own. Null for notifications without a target. A target deleted since then
 * shows that page's own not-found state.
 */
export function getNotificationHref(target: Target | null, orgSlug: string): string | null {
  return target ? TARGET_HREFS[target.type](orgSlug, target.id) : null
}
