// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'

import { memberPreferences } from '@/database/tables/index.js'

import type { DbExecutor } from '@/core/database/index.js'

export type MemberPreferencesRow = typeof memberPreferences.$inferSelect
export type MemberPreferencesValues = Pick<
  typeof memberPreferences.$inferInsert,
  'defaultModelKey' | 'preferences'
>

/** `member_preferences`, always filtered by the organization and the signed-in member. */
export class MemberPreferencesRepository {
  find(tx: DbExecutor, orgId: string, userId: string) {
    return tx.query.memberPreferences.findFirst({
      where: and(eq(memberPreferences.organizationId, orgId), eq(memberPreferences.userId, userId)),
    })
  }

  /** Created on the first change: a missing row means the defaults. */
  async upsert(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    values: MemberPreferencesValues,
  ): Promise<MemberPreferencesRow> {
    const [row] = await tx
      .insert(memberPreferences)
      .values({ organizationId: orgId, userId, ...values })
      .onConflictDoUpdate({
        target: [memberPreferences.organizationId, memberPreferences.userId],
        set: values,
      })
      .returning()
    if (row === undefined) throw new Error('member preferences upsert returned no row')
    return row
  }
}
