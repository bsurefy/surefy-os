// SPDX-License-Identifier: AGPL-3.0-only
import { type SQL, sql } from 'drizzle-orm'
import { type AnyPgColumn, pgPolicy } from 'drizzle-orm/pg-core'

// One builder per RLS policy family (conventions-and-security.md, §4). Tables never write raw
// pgPolicy calls. Adding a policy to a table enables RLS on it; FORCE RLS is a custom migration.

// nullif: a pooled connection returns '' (not null) after a previous transaction set the value,
// and ''::uuid would raise instead of matching no rows.
const currentOrgId = sql`nullif(current_setting('app.org_id', true), '')::uuid`
const currentUserId = sql`nullif(current_setting('app.user_id', true), '')::uuid`
const isSystem = sql`coalesce(current_setting('app.scope', true), '') = 'system'`

const tenantMatches = (organizationId: AnyPgColumn): SQL =>
  sql`(${organizationId} = ${currentOrgId} or ${isSystem})`

/** tenant: read and write rows of the current organization (or any row under system scope). */
export const tenantPolicy = (table: string, organizationId: AnyPgColumn) =>
  pgPolicy(`${table}_tenant_isolation`, {
    as: 'permissive',
    for: 'all', // no `to`: applies to every role, including the owner under FORCE RLS
    using: tenantMatches(organizationId),
    withCheck: tenantMatches(organizationId),
  })

/** tenant+self: also lets a person read their own rows under db.user. */
export const selfReadPolicy = (table: string, userId: AnyPgColumn) =>
  pgPolicy(`${table}_self_read`, { for: 'select', using: sql`${userId} = ${currentUserId}` })

/** tenant+member-read (organizations only): read organizations the person actively belongs to. */
export const memberReadPolicy = (id: AnyPgColumn) =>
  pgPolicy('organizations_member_read', {
    for: 'select',
    using: sql`exists (
      select 1 from organization_members m
      where m.organization_id = ${id} and m.user_id = ${currentUserId} and m.status = 'active')`,
  })

/** self: rows that belong to the person (user_preferences). */
export const selfPolicy = (table: string, userId: AnyPgColumn) =>
  pgPolicy(`${table}_self_access`, {
    for: 'all',
    using: sql`(${userId} = ${currentUserId} or ${isSystem})`,
    withCheck: sql`(${userId} = ${currentUserId} or ${isSystem})`,
  })

/** catalog: add to tenantPolicy; global rows (null organization) are readable by every tenant. */
export const catalogReadPolicy = (table: string, organizationId: AnyPgColumn) =>
  pgPolicy(`${table}_catalog_read`, { for: 'select', using: sql`${organizationId} is null` })

/** owned-or-system: tenant rows for their owner; rows with a null organization only under system scope. */
export const ownedOrSystemPolicy = (table: string, organizationId: AnyPgColumn) =>
  pgPolicy(`${table}_owned_or_system`, {
    for: 'all',
    using: tenantMatches(organizationId), // null = x is never true, so null rows need system scope
    withCheck: tenantMatches(organizationId),
  })

/** system-only: invisible to tenant and user scopes. */
export const systemOnlyPolicy = (table: string) =>
  pgPolicy(`${table}_system_only`, { for: 'all', using: isSystem, withCheck: isSystem })
