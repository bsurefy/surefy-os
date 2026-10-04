// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, sql } from 'drizzle-orm'

import { organizations, organizationSlugHistory } from '@/database/tables/index.js'

import { ORGANIZATION_CREATE_LOCK, SLUG_REDIRECT_DAYS } from './organizations.constants.js'

import type { DbExecutor } from '@/core/database/index.js'

export type OrganizationRow = typeof organizations.$inferSelect
export type NewOrganizationRow = typeof organizations.$inferInsert
export type OrganizationPatch = Partial<
  Pick<NewOrganizationRow, 'name' | 'slug' | 'timezone' | 'defaultLocale' | 'currency' | 'settings'>
>

export interface ResolvedSlug {
  organizationId: string
  currentSlug: string
  isRedirect: boolean
}

/**
 * `organizations` and `organization_slug_history`. Tenant reads filter by id even though RLS
 * (`organizations_tenant_isolation`) does too; pre-tenant lookups go through the definer
 * functions, which return only what the caller needs.
 */
export class OrganizationsRepository {
  /** A uuidv7 from Postgres: the id is known before `db.tenant(newOrgId)` opens. */
  async newId(executor: DbExecutor): Promise<string> {
    const result = await executor.execute<{ id: string }>(sql`select uuidv7() as id`)
    const id = result.rows[0]?.id
    if (id === undefined) throw new Error('uuidv7() returned no row')
    return id
  }

  findById(tx: DbExecutor, orgId: string) {
    return tx.query.organizations.findFirst({ where: eq(organizations.id, orgId) })
  }

  async insert(tx: DbExecutor, values: NewOrganizationRow): Promise<OrganizationRow> {
    const [row] = await tx.insert(organizations).values(values).returning()
    if (row === undefined) throw new Error('organization insert returned no row')
    return row
  }

  async update(tx: DbExecutor, orgId: string, patch: OrganizationPatch) {
    const [row] = await tx
      .update(organizations)
      .set(patch)
      .where(eq(organizations.id, orgId))
      .returning()
    return row
  }

  /** Invalidates the organization's cached effective access (organizations-and-members.md). */
  async bumpAccessVersion(tx: DbExecutor, orgId: string): Promise<void> {
    await tx
      .update(organizations)
      .set({ accessVersion: sql`${organizations.accessVersion} + 1` })
      .where(eq(organizations.id, orgId))
  }

  /** Serializes organization creation on the install until the transaction ends. */
  async lockCreation(tx: DbExecutor): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ORGANIZATION_CREATE_LOCK}))`)
  }

  /** Serializes concurrent changes to the same slug until the transaction ends. */
  async lockSlug(tx: DbExecutor, slug: string): Promise<void> {
    const key = `slug:${slug}`
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
  }

  /** Every organization row on the install (definer `install_organization_count`). */
  async countOnInstall(executor: DbExecutor): Promise<number> {
    const result = await executor.execute<{ count: number }>(
      sql`select install_organization_count() as count`,
    )
    return result.rows[0]?.count ?? 0
  }

  /** Definer `organization_slug_available`: no organization uses it and no retired slug redirects. */
  async isSlugAvailable(executor: DbExecutor, slug: string): Promise<boolean> {
    const result = await executor.execute<{ available: boolean }>(
      sql`select organization_slug_available(${slug}) as available`,
    )
    return result.rows[0]?.available === true
  }

  /** Definer `organization_resolve_slug`: the organization behind a current or redirecting slug. */
  async resolveSlug(executor: DbExecutor, slug: string): Promise<ResolvedSlug | undefined> {
    const result = await executor.execute<{
      organization_id: string
      current_slug: string
      is_redirect: boolean
    }>(
      sql`select organization_id, current_slug, is_redirect from organization_resolve_slug(${slug})`,
    )
    const row = result.rows[0]
    if (row === undefined) return undefined
    return {
      organizationId: row.organization_id,
      currentSlug: row.current_slug,
      isRedirect: row.is_redirect,
    }
  }

  /** The retired slug redirects to the organization for `SLUG_REDIRECT_DAYS`. */
  async insertSlugHistory(tx: DbExecutor, orgId: string, slug: string): Promise<void> {
    await tx.insert(organizationSlugHistory).values({
      organizationId: orgId,
      slug,
      redirectUntil: sql`now() + make_interval(days => ${SLUG_REDIRECT_DAYS})`,
    })
  }

  /** Taking back a recent slug removes the organization's own redirect for it. */
  async deleteSlugHistory(tx: DbExecutor, orgId: string, slug: string): Promise<void> {
    await tx
      .delete(organizationSlugHistory)
      .where(
        and(
          eq(organizationSlugHistory.organizationId, orgId),
          eq(organizationSlugHistory.slug, slug),
        ),
      )
  }
}
