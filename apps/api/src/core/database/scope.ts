// SPDX-License-Identifier: AGPL-3.0-only
import { AsyncLocalStorage } from 'node:async_hooks'

import type { SystemScopeReason } from './systemReasons.js'

/** The RLS context of the running transaction (see conventions-and-security.md, §3). */
export type DatabaseScope =
  | { kind: 'tenant'; orgId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'system'; reason: SystemScopeReason }

const storage = new AsyncLocalStorage<DatabaseScope>()

/** The scope of the enclosing `db.tenant` / `db.user` / `db.system` call, if any. */
export const currentScope = (): DatabaseScope | undefined => storage.getStore()

/**
 * Helpers never nest: a nested transaction would run on another pooled connection, without the
 * outer settings, and silently see no rows or mix two contexts.
 */
export function assertNoActiveScope(): void {
  if (storage.getStore() !== undefined) throw new Error('nested database scope')
}

export const runInScope = <T>(scope: DatabaseScope, fn: () => Promise<T>): Promise<T> =>
  storage.run(scope, fn)
