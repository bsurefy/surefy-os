// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  getMemberAccessRoute,
  getMyAccessRoute,
  getOrganizationPolicyRoute,
  getTeamAccessRoute,
  getTeamPolicyRoute,
  updateOrganizationPolicyRoute,
  updateTeamPolicyRoute,
} from './access.schema.js'

import type { AccessController } from './access.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function accessRoutes(controller: AccessController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.ACCESS_READ)
    app.get(
      '/orgs/:orgId/access/me',
      { schema: getMyAccessRoute, preHandler: app.authorize(PERMISSIONS.ACCESS_READ_SELF) },
      controller.mine,
    )
    app.get(
      '/orgs/:orgId/access/members/:userId',
      { schema: getMemberAccessRoute, preHandler: read },
      controller.member,
    )
    app.get(
      '/orgs/:orgId/access/teams/:teamId',
      { schema: getTeamAccessRoute, preHandler: read },
      controller.team,
    )
    app.get(
      '/orgs/:orgId/access/policy',
      { schema: getOrganizationPolicyRoute, preHandler: read },
      controller.organizationPolicy,
    )
    app.put(
      '/orgs/:orgId/access/policy',
      {
        schema: updateOrganizationPolicyRoute,
        preHandler: app.authorize(PERMISSIONS.SETTINGS_MANAGE),
      },
      controller.updateOrganizationPolicy,
    )
    app.get(
      '/orgs/:orgId/teams/:teamId/access-policy',
      { schema: getTeamPolicyRoute, preHandler: read },
      controller.teamPolicy,
    )
    app.put(
      '/orgs/:orgId/teams/:teamId/access-policy',
      { schema: updateTeamPolicyRoute, preHandler: app.authorize(PERMISSIONS.TEAMS_MANAGE) },
      controller.updateTeamPolicy,
    )
    return Promise.resolve()
  }
}
