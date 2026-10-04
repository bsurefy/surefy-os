// SPDX-License-Identifier: AGPL-3.0-only
import { TeamsController } from './teams.controller.js'
import { TeamsRepository } from './teams.repository.js'
import { teamsRoutes } from './teams.routes.js'
import { TeamsService } from './teams.service.js'

import type { TeamMemberships, TeamOrganizations, TeamUserRefs } from './teams.types.js'
import type { Database } from '@/core/database/index.js'

export interface TeamsModuleDeps {
  db: Database
  /** The members module's membership primitives (`MembershipsService`). */
  memberships: TeamMemberships
  organizations: TeamOrganizations
  users: TeamUserRefs
}

export function createTeamsModule(deps: TeamsModuleDeps) {
  const service = new TeamsService({
    db: deps.db,
    teamsRepository: new TeamsRepository(),
    memberships: deps.memberships,
    organizations: deps.organizations,
    users: deps.users,
  })
  return { service, routes: teamsRoutes(new TeamsController(service)) }
}
export type TeamsModule = ReturnType<typeof createTeamsModule>
