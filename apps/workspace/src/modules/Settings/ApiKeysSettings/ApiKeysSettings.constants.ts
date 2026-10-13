// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

/** Revoked keys stay hidden until that filter is chosen. */
export const API_KEY_STATUS_FILTERS = ['active', 'revoked'] as const

export const API_KEY_SORTS = [
  'name',
  '-name',
  'createdAt',
  '-createdAt',
  'lastUsedAt',
  '-lastUsedAt',
] as const
export type ApiKeySort = (typeof API_KEY_SORTS)[number]

/** The dialogs of the API keys screen; one is open at a time. */
export const API_KEY_DIALOG = {
  CREATE: 'create',
  RENAME: 'rename',
  REVOKE: 'revoke',
} as const
export type ApiKeyDialogKind = (typeof API_KEY_DIALOG)[keyof typeof API_KEY_DIALOG]

/**
 * What a key can carry, in the order the dialog lists them. V1 offers running agents; more
 * appear here as the public API grows. A person is offered only the ones they hold.
 */
export const API_KEY_SCOPE_CHOICES = [PERMISSIONS.AGENTS_INVOKE] as const

/** "Expires" choices of the create dialog. */
export const API_KEY_EXPIRY_CHOICES = ['30d', '90d', '1y', 'date', 'never'] as const
export type ApiKeyExpiryChoice = (typeof API_KEY_EXPIRY_CHOICES)[number]
export const API_KEY_DEFAULT_EXPIRY: ApiKeyExpiryChoice = '90d'

export const API_KEY_EXPIRY_DAYS = { '30d': 30, '90d': 90, '1y': 365 } as const

/** Permission chips shown in a row before "+N". */
export const API_KEY_CHIPS_SHOWN = 1

/** Where a key is used, for the example call; the agent is the person's to fill in. */
export const API_KEY_EXAMPLE_AGENT = '<agent-id>'
