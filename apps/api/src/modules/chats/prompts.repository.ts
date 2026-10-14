// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, gt, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'

import { prompts, promptShares, teams } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type { ListPromptsQuery, TeamRefDto } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

const p = prompts
const ps = promptShares

export type PromptRow = typeof prompts.$inferSelect
export type NewPromptRow = typeof prompts.$inferInsert
export type PromptPatch = Partial<
  Pick<
    PromptRow,
    | 'title'
    | 'body'
    | 'variables'
    | 'visibility'
    | 'ownerUserId'
    | 'updatedByUserId'
    | 'deletedAt'
    | 'deletedByUserId'
  >
>

/** Who looks: a person, their teams, and whether they manage shared prompts. */
export interface PromptViewer {
  userId: string
  teamIds: readonly string[]
  managesShared: boolean
}

export interface PromptListRow {
  prompt: PromptRow
  sortKey: string
}

const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (ch) => '\\' + ch)}%`

/**
 * A personal prompt is its owner's; a shared prompt is seen by its owner and by the whole
 * organization, or by the members of the teams it lists.
 */
export function canSeeSql(viewer: PromptViewer): SQL {
  const teamsOf =
    viewer.teamIds.length === 0
      ? sql`false`
      : sql`exists (select 1 from ${ps} s where s.organization_id = ${p.organizationId}
          and s.prompt_id = ${p.id} and s.team_id = any(${sql.param([...viewer.teamIds])}::uuid[]))`
  return sql`(${p.ownerUserId} = ${viewer.userId} or (${p.visibility} = 'shared' and (
    not exists (select 1 from ${ps} s where s.organization_id = ${p.organizationId} and s.prompt_id = ${p.id})
    or ${teamsOf})))`
}

/**
 * Who may restore a deleted prompt, and so finds it in Recently deleted: its owner, or for a
 * shared prompt without an owner, anyone who manages shared prompts and can see it.
 */
function canRestoreSql(viewer: PromptViewer): SQL {
  const own = sql`${p.ownerUserId} = ${viewer.userId}`
  if (!viewer.managesShared) return own
  return sql`(${own} or (${p.visibility} = 'shared' and ${p.ownerUserId} is null and ${canSeeSql(viewer)}))`
}

const promptSort = (sort: string | undefined, state: 'active' | 'deleted'): KeysetSort => {
  const { field, descending } = parseSort<'updatedAt' | 'title' | 'deletedAt'>(
    sort,
    state === 'deleted' ? '-deletedAt' : '-updatedAt',
  )
  if (field === 'title') return { expression: sql`lower(${p.title})`, cast: 'text', descending }
  const column = field === 'deletedAt' ? p.deletedAt : p.updatedAt
  return { expression: column, cast: 'timestamptz', descending }
}

/** `prompts` and `prompt_shares`: every query filters by organization and by who looks. */
export class PromptsRepository {
  listPage(
    tx: DbExecutor,
    orgId: string,
    viewer: PromptViewer,
    page: { limit: number; query: ListPromptsQuery; restorableAfter: Date; cursor?: KeysetCursor },
  ): Promise<PromptListRow[]> {
    const { query } = page
    const deleted = query.state === 'deleted'
    const sort = promptSort(query.sort, query.state)
    const visibilities = query.visibility ?? []
    return tx
      .select({ prompt: p, sortKey: keysetKey(sort) })
      .from(p)
      .where(
        and(
          eq(p.organizationId, orgId),
          deleted
            ? and(isNotNull(p.deletedAt), gt(p.deletedAt, page.restorableAfter))
            : isNull(p.deletedAt),
          deleted ? canRestoreSql(viewer) : canSeeSql(viewer),
          visibilities.length === 0 ? undefined : inArray(p.visibility, [...visibilities]),
          query.q === undefined
            ? undefined
            : or(ilike(p.title, likeTerm(query.q)), ilike(p.body, likeTerm(query.q))),
          // a deleted-order page holds only deleted prompts, so the sort key is never null
          keysetAfter(sort, p.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(sort, p.id))
      .limit(page.limit + 1)
  }

  /** An active prompt the viewer can see. */
  async findVisible(
    tx: DbExecutor,
    orgId: string,
    viewer: PromptViewer,
    promptId: string,
    options: { lock?: boolean } = {},
  ): Promise<PromptRow | undefined> {
    const query = tx
      .select()
      .from(p)
      .where(
        and(
          eq(p.organizationId, orgId),
          eq(p.id, promptId),
          isNull(p.deletedAt),
          canSeeSql(viewer),
        ),
      )
    const [row] = options.lock === true ? await query.for('update') : await query
    return row
  }

  /** A deleted prompt the viewer may restore, still within the restore window. */
  async findRestorable(
    tx: DbExecutor,
    orgId: string,
    viewer: PromptViewer,
    promptId: string,
    restorableAfter: Date,
  ): Promise<PromptRow | undefined> {
    const [row] = await tx
      .select()
      .from(p)
      .where(
        and(
          eq(p.organizationId, orgId),
          eq(p.id, promptId),
          isNotNull(p.deletedAt),
          gt(p.deletedAt, restorableAfter),
          canRestoreSql(viewer),
        ),
      )
      .for('update')
    return row
  }

  async insert(tx: DbExecutor, row: NewPromptRow): Promise<PromptRow> {
    const [created] = await tx.insert(p).values(row).returning()
    if (created === undefined) throw new Error('prompt insert returned no row')
    return created
  }

  async update(
    tx: DbExecutor,
    orgId: string,
    promptId: string,
    patch: PromptPatch,
  ): Promise<PromptRow | undefined> {
    const [row] = await tx
      .update(p)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(p.organizationId, orgId), eq(p.id, promptId)))
      .returning()
    return row
  }

  /** The teams of each prompt, by name. */
  async teamsOf(
    tx: DbExecutor,
    orgId: string,
    promptIds: readonly string[],
  ): Promise<Map<string, TeamRefDto[]>> {
    const byPrompt = new Map<string, TeamRefDto[]>()
    if (promptIds.length === 0) return byPrompt
    const rows = await tx
      .select({ promptId: ps.promptId, id: teams.id, name: teams.name })
      .from(ps)
      .innerJoin(teams, and(eq(teams.organizationId, ps.organizationId), eq(teams.id, ps.teamId)))
      .where(and(eq(ps.organizationId, orgId), inArray(ps.promptId, [...promptIds])))
      .orderBy(asc(sql`lower(${teams.name})`), asc(teams.id))
    for (const row of rows) {
      byPrompt.set(row.promptId, [
        ...(byPrompt.get(row.promptId) ?? []),
        { id: row.id, name: row.name },
      ])
    }
    return byPrompt
  }

  /** Replaces the teams of a prompt in the caller's transaction. */
  async replaceTeams(
    tx: DbExecutor,
    orgId: string,
    promptId: string,
    teamIds: readonly string[],
  ): Promise<void> {
    await tx.delete(ps).where(and(eq(ps.organizationId, orgId), eq(ps.promptId, promptId)))
    if (teamIds.length === 0) return
    await tx
      .insert(ps)
      .values([...new Set(teamIds)].map((teamId) => ({ organizationId: orgId, promptId, teamId })))
  }

  /** The ids among `teamIds` that are teams of the organization. */
  async existingTeams(
    tx: DbExecutor,
    orgId: string,
    teamIds: readonly string[],
  ): Promise<Set<string>> {
    if (teamIds.length === 0) return new Set()
    const rows = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.organizationId, orgId), inArray(teams.id, [...teamIds])))
    return new Set(rows.map((row) => row.id))
  }
}
