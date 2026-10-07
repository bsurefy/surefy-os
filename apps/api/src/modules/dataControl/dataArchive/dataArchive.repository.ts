// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'

import type { DbExecutor } from '@/core/database/index.js'

/**
 * One area of the full organization export: a table's rows of the organization as JSON, minus
 * the columns that must never leave the database (token hashes).
 */
interface ArchiveArea {
  file: string
  table: string
  column: string
  omit: readonly string[]
}

/** The areas of the full export; later modules add theirs (chats, knowledge, agents…). */
const AREAS: readonly ArchiveArea[] = [
  { file: 'organization.json', table: 'organizations', column: 'id', omit: [] },
  { file: 'teams.json', table: 'teams', column: 'organization_id', omit: [] },
  { file: 'team-members.json', table: 'team_members', column: 'organization_id', omit: [] },
  {
    file: 'invitations.json',
    table: 'invitations',
    column: 'organization_id',
    omit: ['token_hash'],
  },
  { file: 'access-policies.json', table: 'access_policies', column: 'organization_id', omit: [] },
  { file: 'notifications.json', table: 'notifications', column: 'organization_id', omit: [] },
  { file: 'audit-log.json', table: 'audit_logs', column: 'organization_id', omit: [] },
  { file: 'data-requests.json', table: 'data_requests', column: 'organization_id', omit: [] },
]

/**
 * Read-only reads of every area for the full export, inside the organization's tenant
 * transaction (RLS applies). Rows are JSON documents, ordered for a stable archive.
 */
export class DataArchiveRepository {
  async readAreas(tx: DbExecutor, orgId: string): Promise<{ file: string; json: string }[]> {
    const files: { file: string; json: string }[] = []
    for (const area of AREAS) {
      const omit = sql`${sql.param([...area.omit])}::text[]`
      const result = await tx.execute<{ rows: string }>(sql`
        select coalesce(jsonb_agg(to_jsonb(t) - ${omit} order by t.created_at), '[]'::jsonb)::text
          as rows
        from ${sql.identifier(area.table)} t
        where ${sql.identifier(area.column)} = ${orgId}`)
      files.push({ file: area.file, json: result.rows[0]?.rows ?? '[]' })
    }
    files.push({ file: 'members.json', json: await this.readMembers(tx, orgId) })
    return files
  }

  /** Memberships with the person's name and email. */
  private async readMembers(tx: DbExecutor, orgId: string): Promise<string> {
    const result = await tx.execute<{ rows: string }>(sql`
      select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object('name', u.name, 'email', u.email)
        order by m.created_at), '[]'::jsonb)::text as rows
      from organization_members m
      join users u on u.id = m.user_id
      where m.organization_id = ${orgId}`)
    return result.rows[0]?.rows ?? '[]'
  }

  /** Stored files of the organization that the archive includes (the logo for now). */
  async listObjectKeys(tx: DbExecutor, orgId: string): Promise<string[]> {
    const result = await tx.execute<{ key: string | null }>(
      sql`select logo_object_key as key from organizations where id = ${orgId}`,
    )
    return result.rows.flatMap((row) => (row.key === null ? [] : [row.key]))
  }
}
