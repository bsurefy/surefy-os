// SPDX-License-Identifier: AGPL-3.0-only
import { and, desc, eq, gt, ne, sql } from 'drizzle-orm'

import { sessions, userPreferences } from '@/database/tables/index.js'

import type { DbExecutor } from '@/core/database/index.js'

export type SessionRow = typeof sessions.$inferSelect
export type UserPreferencesRow = typeof userPreferences.$inferSelect
export type UserPreferencesPatch = Partial<
  Pick<UserPreferencesRow, 'locale' | 'theme' | 'timezone' | 'lastOrganizationId'>
>

/**
 * Sessions (global, `db.global`) and personal preferences (RLS family `self`, `db.user`). Session
 * writes go through Better Auth, which also clears its Redis copy; this repository only reads.
 */
export class AuthRepository {
  /** Unexpired sessions of a person, newest first, on `sessions_user_id_idx`. */
  listActiveSessions(executor: DbExecutor, userId: string, limit: number) {
    return executor
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, sql`now()`)))
      .orderBy(desc(sessions.createdAt), desc(sessions.id))
      .limit(limit)
  }

  findSession(executor: DbExecutor, userId: string, sessionId: string) {
    return executor.query.sessions.findFirst({
      where: and(eq(sessions.userId, userId), eq(sessions.id, sessionId)),
    })
  }

  /** The tokens of every unexpired session of a person except one. */
  listOtherSessionTokens(executor: DbExecutor, userId: string, exceptSessionId: string) {
    return executor
      .select({ token: sessions.token })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          ne(sessions.id, exceptSessionId),
          gt(sessions.expiresAt, sql`now()`),
        ),
      )
  }

  findPreferences(tx: DbExecutor, userId: string) {
    return tx.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) })
  }

  /** The row is created on the first write (identity-and-auth.md, §7). */
  async upsertPreferences(tx: DbExecutor, userId: string, patch: UserPreferencesPatch) {
    const [row] = await tx
      .insert(userPreferences)
      .values({ userId, ...patch })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { ...patch, updatedAt: sql`now()` },
      })
      .returning()
    if (row === undefined) throw new Error('upsert returned no row')
    return row
  }
}
