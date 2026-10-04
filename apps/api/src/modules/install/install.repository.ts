// SPDX-License-Identifier: AGPL-3.0-only
import { asc, eq, isNull, sql } from 'drizzle-orm'

import { installAdmins, installSettings } from '@/database/tables/index.js'

import type { DbExecutor } from '@/core/database/index.js'

export type InstallSettingsRow = typeof installSettings.$inferSelect
export type InstallSettingsPatch = Partial<
  Omit<typeof installSettings.$inferInsert, 'id' | 'installationId' | 'createdAt' | 'updatedAt'>
>
export type InstallAdminRow = typeof installAdmins.$inferSelect

/** One organization as `install_list_organizations` returns it. */
export interface InstallOrganizationRow {
  organizationId: string
  name: string
  slug: string
  status: string
  logoObjectKey: string | null
  activeMemberCount: number
  createdAt: string
}

const SETTINGS_ID = 1

/**
 * `install_settings` (one row) and `install_admins`. Both are global tables: callers pass
 * `db.global` or a transaction; pre-tenant and cross-organization reads go through the definer
 * functions.
 */
export class InstallRepository {
  /**
   * The settings row. The first migration inserts it; if it is ever missing (a restored or
   * truncated database), it is recreated with the defaults, as the migration does.
   */
  async getSettings(executor: DbExecutor): Promise<InstallSettingsRow> {
    const row = await executor.query.installSettings.findFirst({
      where: eq(installSettings.id, SETTINGS_ID),
    })
    if (row !== undefined) return row
    await executor.insert(installSettings).values({ id: SETTINGS_ID }).onConflictDoNothing()
    const created = await executor.query.installSettings.findFirst({
      where: eq(installSettings.id, SETTINGS_ID),
    })
    if (created === undefined) throw new Error('install_settings row missing')
    return created
  }

  /** Transaction-participating: the row, locked until the transaction ends. */
  async lockSettings(executor: DbExecutor): Promise<InstallSettingsRow> {
    await this.getSettings(executor)
    const [row] = await executor
      .select()
      .from(installSettings)
      .where(eq(installSettings.id, SETTINGS_ID))
      .for('update')
    if (row === undefined) throw new Error('install_settings row missing')
    return row
  }

  async updateSettings(executor: DbExecutor, patch: InstallSettingsPatch) {
    const [row] = await executor
      .update(installSettings)
      .set(patch)
      .where(eq(installSettings.id, SETTINGS_ID))
      .returning()
    if (row === undefined) throw new Error('install_settings row missing')
    return row
  }

  /** Sets `setup_completed_at` once; later calls keep the first time. */
  async markSetupCompleted(executor: DbExecutor): Promise<void> {
    await this.getSettings(executor)
    await executor
      .update(installSettings)
      .set({ setupCompletedAt: sql`now()` })
      .where(isNull(installSettings.setupCompletedAt))
  }

  async isAdmin(executor: DbExecutor, userId: string): Promise<boolean> {
    const row = await executor.query.installAdmins.findFirst({
      where: eq(installAdmins.userId, userId),
      columns: { userId: true },
    })
    return row !== undefined
  }

  listAdmins(executor: DbExecutor): Promise<InstallAdminRow[]> {
    return executor
      .select()
      .from(installAdmins)
      .orderBy(asc(installAdmins.createdAt), asc(installAdmins.userId))
  }

  /** Every administrator's id, locked: removals serialize so the last one always remains. */
  async lockAdminIds(executor: DbExecutor): Promise<string[]> {
    const rows = await executor
      .select({ userId: installAdmins.userId })
      .from(installAdmins)
      .for('update')
    return rows.map((row) => row.userId)
  }

  /** The new row, or undefined when the person already is an administrator. */
  async insertAdmin(
    executor: DbExecutor,
    values: { userId: string; grantedByUserId: string | null },
  ): Promise<InstallAdminRow | undefined> {
    const [row] = await executor
      .insert(installAdmins)
      .values(values)
      .onConflictDoNothing({ target: installAdmins.userId })
      .returning()
    return row
  }

  async deleteAdmin(executor: DbExecutor, userId: string): Promise<void> {
    await executor.delete(installAdmins).where(eq(installAdmins.userId, userId))
  }

  /** Definer `install_list_organizations`: keyset on id, at most 100 rows. */
  async listOrganizations(
    executor: DbExecutor,
    after: string | null,
    limit: number,
  ): Promise<InstallOrganizationRow[]> {
    const result = await executor.execute<{
      organization_id: string
      name: string
      slug: string
      status: string
      logo_object_key: string | null
      active_member_count: number
      created_at: string | Date
    }>(sql`select * from install_list_organizations(${after}::uuid, ${limit}::integer)`)
    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      logoObjectKey: row.logo_object_key,
      activeMemberCount: row.active_member_count,
      createdAt: new Date(row.created_at).toISOString(),
    }))
  }

  /** Definer `install_organization_count`: every organization row, whatever its status. */
  async countOrganizations(executor: DbExecutor): Promise<number> {
    const result = await executor.execute<{ count: number }>(
      sql`select install_organization_count() as count`,
    )
    return result.rows[0]?.count ?? 0
  }
}
