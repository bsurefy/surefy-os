// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  addTeamMembersRoute,
  createTeamRoute,
  deleteTeamRoute,
  getTeamRoute,
  listTeamMembersRoute,
  listTeamsRoute,
  removeTeamMemberRoute,
  teamDeletionImpactRoute,
  updateTeamRoute,
} from './teams.schema.js'

import type { TeamsController } from './teams.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function teamsRoutes(controller: TeamsController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.TEAMS_READ)
    const manage = app.authorize(PERMISSIONS.TEAMS_MANAGE)
    app.get('/orgs/:orgId/teams', { schema: listTeamsRoute, preHandler: read }, controller.list)
    app.post(
      '/orgs/:orgId/teams',
      { schema: createTeamRoute, preHandler: manage },
      controller.create,
    )
    app.get(
      '/orgs/:orgId/teams/:teamId',
      { schema: getTeamRoute, preHandler: read },
      controller.get,
    )
    app.patch(
      '/orgs/:orgId/teams/:teamId',
      { schema: updateTeamRoute, preHandler: manage },
      controller.update,
    )
    app.delete(
      '/orgs/:orgId/teams/:teamId',
      { schema: deleteTeamRoute, preHandler: manage },
      controller.delete,
    )
    app.get(
      '/orgs/:orgId/teams/:teamId/deletion-impact',
      { schema: teamDeletionImpactRoute, preHandler: manage },
      controller.deletionImpact,
    )
    app.get(
      '/orgs/:orgId/teams/:teamId/members',
      { schema: listTeamMembersRoute, preHandler: read },
      controller.listMembers,
    )
    app.post(
      '/orgs/:orgId/teams/:teamId/members',
      { schema: addTeamMembersRoute, preHandler: manage },
      controller.addMembers,
    )
    app.delete(
      '/orgs/:orgId/teams/:teamId/members/:userId',
      { schema: removeTeamMemberRoute, preHandler: manage },
      controller.removeMember,
    )
    return Promise.resolve()
  }
}
