// SPDX-License-Identifier: AGPL-3.0-only
export { createTeamsModule, type TeamsModule } from './teams.module.js'
export { TeamNotFoundError } from './teams.errors.js'
export type { TeamsService } from './teams.service.js'
export type {
  TeamMembershipRef,
  TeamMemberships,
  TeamOrganizations,
  TeamsContext,
  TeamUserRefs,
} from './teams.types.js'
