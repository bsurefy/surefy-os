// SPDX-License-Identifier: AGPL-3.0-only
import { TeamsController } from './teams.controller.js'
import { TeamsRepository } from './teams.repository.js'
import { teamsRoutes } from './teams.routes.js'
import { TeamsService } from './teams.service.js'

import type {
  TeamConnections,
  TeamMemberships,
  TeamOrganizations,
  TeamUserRefs,
} from './teams.types.js'
import type { Database } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface TeamsModuleDeps {
  db: Database
  /** The members module's membership primitives (`MembershipsService`). */
  memberships: TeamMemberships
  organizations: TeamOrganizations
  users: TeamUserRefs
  audit: AuditRecorder
  /** Team-scoped connections, for the deletion dialog; none until the connections module exists. */
  connections?: () => TeamConnections
}

export function createTeamsModule(deps: TeamsModuleDeps) {
  const service = new TeamsService({
    db: deps.db,
    teamsRepository: new TeamsRepository(),
    memberships: deps.memberships,
    organizations: deps.organizations,
    users: deps.users,
    audit: deps.audit,
    ...(deps.connections === undefined ? {} : { connections: deps.connections }),
  })
  return { service, routes: teamsRoutes(new TeamsController(service)) }
}
export type TeamsModule = ReturnType<typeof createTeamsModule>
