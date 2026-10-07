// SPDX-License-Identifier: AGPL-3.0-only
import { MemberInvitationsController } from './memberInvitations/memberInvitations.controller.js'
import { MemberInvitationsRepository } from './memberInvitations/memberInvitations.repository.js'
import { memberInvitationsRoutes } from './memberInvitations/memberInvitations.routes.js'
import { MemberInvitationsService } from './memberInvitations/memberInvitations.service.js'
import { MemberPreferencesRepository } from './memberPreferences/memberPreferences.repository.js'
import { MemberPreferencesService } from './memberPreferences/memberPreferences.service.js'
import { MembersController } from './members.controller.js'
import { membersRoutes } from './members.routes.js'
import { MembersService } from './members.service.js'
import { MembershipsRepository } from './memberships/memberships.repository.js'
import { MembershipsService } from './memberships/memberships.service.js'

import type {
  MemberNotifications,
  MemberOrganizations,
  MemberRemovalStep,
  MemberTeams,
  MemberUsers,
} from './members.types.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * The membership primitives, built before the organizations and teams modules that write
 * memberships inside their own transactions (the creator's Owner row, primary teams).
 */
export function createMemberships() {
  const repository = new MembershipsRepository()
  return { repository, service: new MembershipsService(repository) }
}
export type Memberships = ReturnType<typeof createMemberships>

export interface MembersModuleDeps {
  config: Config
  db: Database
  memberships: Memberships
  organizations: MemberOrganizations
  teams: MemberTeams
  users: MemberUsers
  notifications: MemberNotifications
  audit: AuditRecorder
  /** Other modules' work when a person is removed (the vault revokes their personal keys). */
  removalSteps?: readonly MemberRemovalStep[]
}

export function createMembersModule(deps: MembersModuleDeps) {
  const { db } = deps
  const membershipsRepository = deps.memberships.repository
  const service = new MembersService({
    db,
    membershipsRepository,
    organizations: deps.organizations,
    teams: deps.teams,
    users: deps.users,
    audit: deps.audit,
    removalSteps: deps.removalSteps ?? [],
  })
  const preferences = new MemberPreferencesService({
    db,
    memberPreferencesRepository: new MemberPreferencesRepository(),
  })
  const invitations = new MemberInvitationsService({
    config: deps.config,
    db,
    invitationsRepository: new MemberInvitationsRepository(),
    membershipsRepository,
    memberships: deps.memberships.service,
    organizations: deps.organizations,
    teams: deps.teams,
    users: deps.users,
    notifications: deps.notifications,
    audit: deps.audit,
  })
  const members = membersRoutes(new MembersController(service, preferences))
  const invitationRoutes = memberInvitationsRoutes(new MemberInvitationsController(invitations))
  const routes: FastifyPluginAsyncZod = async (app) => {
    await app.register(members)
    await app.register(invitationRoutes)
  }
  return {
    service,
    memberships: deps.memberships.service,
    preferences,
    invitations,
    routes,
  }
}
export type MembersModule = ReturnType<typeof createMembersModule>
