// SPDX-License-Identifier: AGPL-3.0-only
import type { ConnectionDto } from '@surefy/contracts'

import { toConnectionDto } from './connections.mapper.js'

import type { ConnectionRow } from './connections.repository.js'
import type {
  ConnectionDependents,
  ConnectionsTeams,
  ConnectionsUserRefs,
} from './connections.types.js'
import type { DbExecutor } from '@/core/database/index.js'

/** Turns rows into DTOs: team names, people and the "Used by" counts are loaded in one batch. */
export class ConnectionPresenter {
  constructor(
    private readonly deps: {
      teams: ConnectionsTeams
      users: ConnectionsUserRefs
      dependents: ConnectionDependents
    },
  ) {}

  async present(
    tx: DbExecutor,
    orgId: string,
    viewerUserId: string | null,
    rows: readonly ConnectionRow[],
  ): Promise<ConnectionDto[]> {
    if (rows.length === 0) return []
    const teamIds = [...new Set(rows.flatMap((row) => (row.teamId === null ? [] : [row.teamId])))]
    const userIds = [
      ...new Set(
        rows.flatMap((row) =>
          [row.ownerUserId, row.connectedByUserId].filter((id): id is string => id !== null),
        ),
      ),
    ]
    // one transaction runs one query at a time
    const teams = teamIds.length === 0 ? [] : await this.deps.teams.findRefsInTx(tx, orgId, teamIds)
    const users = userIds.length === 0 ? new Map() : await this.deps.users.findUserRefs(userIds)
    const usedBy = await this.deps.dependents.counts(
      tx,
      orgId,
      rows.map((row) => row.id),
    )
    const refs = {
      teams: new Map(teams.map((team) => [team.id, team])),
      users,
      usedBy,
      viewerUserId,
    }
    return rows.map((row) => toConnectionDto(row, refs))
  }
}
