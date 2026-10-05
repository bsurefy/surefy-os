// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'

import {
  PERMISSIONS,
  type ExportKind,
  type ExportParams,
  type Feature,
  type Permission,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

/** The rows of one export, as columns and cells. */
export interface ExportTable {
  columns: string[]
  rows: unknown[][]
}

/**
 * Produces one kind of background export inside the organization's tenant transaction. The
 * producing module's read permission (and feature) is checked when the export is requested and
 * again when it is prepared.
 */
export interface ExportProducer {
  kind: ExportKind
  permission: Permission
  feature?: Feature
  containsPersonalData: boolean
  /** Download name without the extension, e.g. `members-2026-10-04`. */
  baseName: (now: Date) => string
  produce(tx: DbExecutor, input: { orgId: string; params: ExportParams }): Promise<ExportTable>
}

/** Settings › Members › Export: the member list (read-only membership and people query). */
export const membersCsvProducer: ExportProducer = {
  kind: 'members_csv',
  permission: PERMISSIONS.MEMBERS_READ,
  containsPersonalData: true,
  baseName: (now) => `members-${now.toISOString().slice(0, 10)}`,
  async produce(tx, { orgId }) {
    const result = await tx.execute<{
      name: string
      email: string
      role: string
      status: string
      joined_at: string
    }>(sql`
      select u.name, u.email, m.role, m.status, m.joined_at
      from organization_members m
      join users u on u.id = m.user_id
      where m.organization_id = ${orgId}
      order by lower(u.name), m.id`)
    return {
      columns: ['name', 'email', 'role', 'status', 'joinedAt'],
      rows: result.rows.map((row) => [row.name, row.email, row.role, row.status, row.joined_at]),
    }
  },
}

/**
 * The producers the data control module owns. Other modules pass theirs to
 * `createDataControlModule` (the usage CSV); run CSVs, chat exports and audit exports
 * (`audit-export`) join with their modules.
 */
export const CORE_EXPORT_PRODUCERS: readonly ExportProducer[] = [membersCsvProducer]
