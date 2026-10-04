// SPDX-License-Identifier: AGPL-3.0-only
import { eq, inArray } from 'drizzle-orm'

import { users } from '@/database/tables/index.js'

import type { DbExecutor } from '@/core/database/index.js'

export type UserRow = typeof users.$inferSelect

/** `users` is global (no RLS): reached through `db.global` by the auth module only. */
export class AuthUsersRepository {
  findById(executor: DbExecutor, userId: string) {
    return executor.query.users.findFirst({ where: eq(users.id, userId) })
  }

  findByIds(executor: DbExecutor, userIds: readonly string[]) {
    return executor
      .select({ id: users.id, name: users.name, email: users.email, image: users.image })
      .from(users)
      .where(inArray(users.id, [...userIds]))
  }

  async findDisabledAt(executor: DbExecutor, userId: string): Promise<Date | null | undefined> {
    const [row] = await executor
      .select({ disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, userId))
    return row?.disabledAt
  }

  async updateName(executor: DbExecutor, userId: string, name: string): Promise<void> {
    await executor.update(users).set({ name }).where(eq(users.id, userId))
  }
}
