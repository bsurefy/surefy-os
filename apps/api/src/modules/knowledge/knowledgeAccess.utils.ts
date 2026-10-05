// SPDX-License-Identifier: AGPL-3.0-only
import { roleAtLeast } from '@surefy/contracts'
import type { KnowledgeAccessLevel, OrgRole } from '@surefy/contracts'

import type { GrantRow, KnowledgeVisibility } from './knowledge.repository.js'
import type { KnowledgeSearcher } from './knowledge.types.js'

export const isAdmin = (role: OrgRole | null): boolean =>
  role !== null && roleAtLeast(role, 'admin')

/** Which bases a person reaches (Admins and Owners every base, others those with a grant). */
export function visibilityOf(who: KnowledgeSearcher): KnowledgeVisibility {
  if (isAdmin(who.role)) return { kind: 'all' }
  return {
    kind: 'member',
    userId: who.userId,
    teamIds: who.teamIds,
    teamsManage: who.role !== null && roleAtLeast(who.role, 'builder'),
  }
}

/**
 * The effective level on one base, computed and never stored (database/knowledge.md §2): Admins
 * and Owners manage every base; otherwise the highest of the person's own grant and their teams'
 * grants, where a team's Can manage applies only to members who are Builders or above.
 */
export function effectiveLevel(
  who: KnowledgeSearcher,
  grants: readonly Pick<GrantRow, 'subjectType' | 'teamId' | 'userId' | 'level'>[],
): KnowledgeAccessLevel | null {
  if (isAdmin(who.role)) return 'manage'
  const teamsManage = who.role !== null && roleAtLeast(who.role, 'builder')
  let level: KnowledgeAccessLevel | null = null
  for (const grant of grants) {
    const applies =
      grant.subjectType === 'user'
        ? grant.userId !== null && grant.userId === who.userId
        : grant.teamId !== null && who.teamIds.includes(grant.teamId)
    if (!applies) continue
    if (grant.level === 'manage' && (grant.subjectType === 'user' || teamsManage)) return 'manage'
    level = 'search'
  }
  return level
}
