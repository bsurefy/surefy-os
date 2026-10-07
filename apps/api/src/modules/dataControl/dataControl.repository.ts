// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, inArray, sql } from 'drizzle-orm'

import { dataExports, dataRequests, organizationMembers } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type {
  DataRequestStatus,
  DataRequestType,
  ExportKind,
  ExportStatus,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type DataRequestRow = typeof dataRequests.$inferSelect
export type NewDataRequestRow = typeof dataRequests.$inferInsert
export type DataRequestPatch = Partial<Omit<NewDataRequestRow, 'id' | 'organizationId'>>
export type ExportRow = typeof dataExports.$inferSelect
export type NewExportRow = typeof dataExports.$inferInsert
export type ExportPatch = Partial<Omit<NewExportRow, 'id' | 'organizationId'>>

/** Data requests and exports read newest first. */
const requestSort: KeysetSort = {
  expression: dataRequests.createdAt,
  cast: 'timestamptz',
  descending: true,
}
const exportSort: KeysetSort = {
  expression: dataExports.createdAt,
  cast: 'timestamptz',
  descending: true,
}

export interface DataRequestPage {
  limit: number
  cursor?: KeysetCursor
  type?: DataRequestType[]
  status?: DataRequestStatus[]
}

export interface ExportPage {
  limit: number
  cursor?: KeysetCursor
  kind?: ExportKind[]
  status?: ExportStatus[]
}

/** `data_requests` and `exports` of one organization; every query filters by organization. */
export class DataControlRepository {
  async insertRequest(tx: DbExecutor, values: NewDataRequestRow): Promise<DataRequestRow> {
    const [row] = await tx.insert(dataRequests).values(values).returning()
    if (row === undefined) throw new Error('data request insert returned no row')
    return row
  }

  async findRequest(tx: DbExecutor, orgId: string, id: string) {
    const [row] = await tx
      .select()
      .from(dataRequests)
      .where(and(eq(dataRequests.organizationId, orgId), eq(dataRequests.id, id)))
    return row
  }

  /** Updates the request only while it is in one of `from` (a state machine step). */
  async updateRequest(
    tx: DbExecutor,
    orgId: string,
    id: string,
    patch: DataRequestPatch,
    from?: readonly DataRequestStatus[],
  ): Promise<DataRequestRow | undefined> {
    const [row] = await tx
      .update(dataRequests)
      .set(patch)
      .where(
        and(
          eq(dataRequests.organizationId, orgId),
          eq(dataRequests.id, id),
          from === undefined ? undefined : inArray(dataRequests.status, [...from]),
        ),
      )
      .returning()
    return row
  }

  listRequests(tx: DbExecutor, orgId: string, page: DataRequestPage) {
    return tx
      .select({ row: dataRequests, sortKey: keysetKey(requestSort) })
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.organizationId, orgId),
          page.type === undefined ? undefined : inArray(dataRequests.type, page.type),
          page.status === undefined ? undefined : inArray(dataRequests.status, page.status),
          keysetAfter(requestSort, dataRequests.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(requestSort, dataRequests.id))
      .limit(page.limit + 1)
  }

  async insertExport(tx: DbExecutor, values: NewExportRow): Promise<ExportRow> {
    const [row] = await tx.insert(dataExports).values(values).returning()
    if (row === undefined) throw new Error('export insert returned no row')
    return row
  }

  /** Only the requester's own exports. */
  async findExport(tx: DbExecutor, orgId: string, userId: string, id: string) {
    const [row] = await tx
      .select()
      .from(dataExports)
      .where(
        and(
          eq(dataExports.organizationId, orgId),
          eq(dataExports.requestedByUserId, userId),
          eq(dataExports.id, id),
        ),
      )
    return row
  }

  async updateExport(
    tx: DbExecutor,
    orgId: string,
    id: string,
    patch: ExportPatch,
    from?: readonly ExportStatus[],
  ): Promise<ExportRow | undefined> {
    const [row] = await tx
      .update(dataExports)
      .set(patch)
      .where(
        and(
          eq(dataExports.organizationId, orgId),
          eq(dataExports.id, id),
          from === undefined ? undefined : inArray(dataExports.status, [...from]),
        ),
      )
      .returning()
    return row
  }

  /** "My exports" (exports_requester_idx). */
  listExports(tx: DbExecutor, orgId: string, userId: string, page: ExportPage) {
    return tx
      .select({ row: dataExports, sortKey: keysetKey(exportSort) })
      .from(dataExports)
      .where(
        and(
          eq(dataExports.organizationId, orgId),
          eq(dataExports.requestedByUserId, userId),
          page.kind === undefined ? undefined : inArray(dataExports.kind, page.kind),
          page.status === undefined ? undefined : inArray(dataExports.status, page.status),
          keysetAfter(exportSort, dataExports.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(exportSort, dataExports.id))
      .limit(page.limit + 1)
  }

  /** Active Owners, who hear about a scheduled deletion (read-only membership query). */
  async listActiveOwnerIds(tx: DbExecutor, orgId: string): Promise<string[]> {
    const rows = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.role, 'owner'),
          eq(organizationMembers.status, 'active'),
        ),
      )
      .orderBy(sql`${organizationMembers.createdAt}`)
    return rows.map((row) => row.userId)
  }
}
