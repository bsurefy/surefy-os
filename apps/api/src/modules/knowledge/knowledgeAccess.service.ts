// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenError } from '@/core/errors/index.js'
import type { KnowledgeAccessLevel } from '@surefy/contracts'

import { KnowledgeNotFoundError } from './knowledge.errors.js'
import { effectiveLevel, visibilityOf } from './knowledgeAccess.utils.js'

import type { KnowledgeBaseRow, KnowledgeRepository } from './knowledge.repository.js'
import type { KnowledgeContext, KnowledgeSearcher } from './knowledge.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'

export interface KnowledgeAccessDeps {
  db: Database
  repository: KnowledgeRepository
}

export const searcherOf = (ctx: KnowledgeContext): KnowledgeSearcher => ({
  userId: ctx.userId,
  role: ctx.role,
  teamIds: ctx.teamIds,
})

/**
 * Who may search or manage which base. The level is computed from the grants on every call; the
 * route guard (`knowledge:read`, `knowledge:upload`) decides whether the action is offered at
 * all, this decides on which bases (database/knowledge.md §2).
 */
export class KnowledgeAccessService {
  constructor(private readonly deps: KnowledgeAccessDeps) {}

  /** The level a person has on each of the bases (absent: no access). */
  async levelsFor(
    tx: DbExecutor,
    orgId: string,
    who: KnowledgeSearcher,
    baseIds: readonly string[],
  ): Promise<Map<string, KnowledgeAccessLevel>> {
    const grants = await this.deps.repository.grantsFor(tx, orgId, baseIds, who)
    const byBase = Map.groupBy(grants, (grant) => grant.baseId)
    const levels = new Map<string, KnowledgeAccessLevel>()
    for (const baseId of baseIds) {
      const level = effectiveLevel(who, byBase.get(baseId) ?? [])
      if (level !== null) levels.set(baseId, level)
    }
    return levels
  }

  /**
   * The base when the caller reaches it at `needed`. A base that does not exist, is deleted
   * (unless `allowDeleted`) or the caller cannot search is `KNOWLEDGE_NOT_FOUND`; one they can
   * search but not manage is a 403 when manage is needed.
   */
  async require(
    tx: DbExecutor,
    ctx: KnowledgeContext,
    baseId: string,
    needed: KnowledgeAccessLevel,
    options: { allowDeleted?: boolean } = {},
  ): Promise<{ base: KnowledgeBaseRow; level: KnowledgeAccessLevel }> {
    const base = await this.deps.repository.findBase(tx, ctx.orgId, baseId)
    if (base === undefined || (base.deletedAt !== null && options.allowDeleted !== true)) {
      throw new KnowledgeNotFoundError()
    }
    const level = (await this.levelsFor(tx, ctx.orgId, searcherOf(ctx), [baseId])).get(baseId)
    if (level === undefined) throw new KnowledgeNotFoundError()
    if (needed === 'manage' && level !== 'manage') throw new ForbiddenError()
    return { base, level }
  }

  /** The active bases a person can search, optionally narrowed to some ids (a chat's scope). */
  async searchableBaseIds(
    tx: DbExecutor,
    orgId: string,
    who: KnowledgeSearcher,
    only?: readonly string[],
  ): Promise<string[]> {
    return this.deps.repository.searchableBaseIds(tx, orgId, visibilityOf(who), only)
  }
}
