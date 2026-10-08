// SPDX-License-Identifier: AGPL-3.0-only
import type { Permission, UserRefDto } from '@surefy/contracts'

import type { ActorSession } from '@/types/context.js'

/** What the service needs from the request: the organization, who acts and what they may give. */
export interface ApiKeysContext {
  orgId: string
  userId: string | null
  session?: Pick<ActorSession, 'createdAt'>
  via?: 'user' | 'support' | 'partner' | 'system' | 'api-key'
  requestId?: string
  ip?: string
  userAgent?: string
  /** The creator's effective permissions: a key never carries more. */
  access: { permissions: readonly Permission[] }
}

/** The access module's fresh-session rule (`AccessService.assertFreshSession`). */
export interface ApiKeysAccess {
  assertFreshSession(ctx: { session?: Pick<ActorSession, 'createdAt'> }): void
}

/** Display data of people, from the module that owns `users`. */
export interface ApiKeyUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}
