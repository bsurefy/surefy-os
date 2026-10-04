// SPDX-License-Identifier: AGPL-3.0-only
import type { EffectiveAccessDto, OrgRole, Permission, SessionApp } from '@surefy/contracts'

/** The Better Auth session a user request came with (`/me`, signed-in devices). */
export interface ActorSession {
  id: string
  app: SessionApp
  createdAt: Date
  expiresAt: Date
}

/** Who is acting (controllers.md, §3). Set on `request.auth` by the session plugin. */
export interface ActorContext {
  /** null only for 'system' (jobs, schedules) and 'api-key' actors */
  userId: string | null
  requestId: string
  via: 'user' | 'support' | 'partner' | 'system' | 'api-key'
  /** set when via is 'user' (and 'support' / 'partner', which are console sessions) */
  session?: ActorSession
  /** set when via is 'api-key': the key, its organization and its permission scope */
  apiKey?: { id: string; orgId: string; permissions: Permission[] }
  /** set when via is 'support' or 'partner': the access grant in use */
  grantId?: string
  ip?: string
  userAgent?: string
}

/** Effective access of one actor in one organization (authorization.md, §5). */
export type EffectiveAccess = EffectiveAccessDto

/** Set on `request.tenant` by `app.authorize()` for routes with `:orgId`. */
export interface TenantContext extends ActorContext {
  orgId: string
  /** null for 'system' and 'api-key' actors */
  role: OrgRole | null
  teamIds: string[]
  access: EffectiveAccess
}
