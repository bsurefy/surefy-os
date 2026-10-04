// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  bulkMemberActionRoute,
  deactivateMemberRoute,
  getMemberPreferencesRoute,
  getMemberRoute,
  listMembersRoute,
  reactivateMemberRoute,
  removeMemberRoute,
  updateMemberPreferencesRoute,
  updateMemberRoute,
} from './members.schema.js'

import type { MembersController } from './members.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function membersRoutes(controller: MembersController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.MEMBERS_READ)
    const manage = app.authorize(PERMISSIONS.MEMBERS_MANAGE)
    const self = app.authorize(PERMISSIONS.MEMBERS_MANAGE_SELF)
    app.get('/orgs/:orgId/members', { schema: listMembersRoute, preHandler: read }, controller.list)
    app.post(
      '/orgs/:orgId/members/bulk',
      { schema: bulkMemberActionRoute, preHandler: manage },
      controller.bulk,
    )
    app.get(
      '/orgs/:orgId/members/me/preferences',
      { schema: getMemberPreferencesRoute, preHandler: self },
      controller.getPreferences,
    )
    app.patch(
      '/orgs/:orgId/members/me/preferences',
      { schema: updateMemberPreferencesRoute, preHandler: self },
      controller.updatePreferences,
    )
    app.get(
      '/orgs/:orgId/members/:memberId',
      { schema: getMemberRoute, preHandler: read },
      controller.get,
    )
    app.patch(
      '/orgs/:orgId/members/:memberId',
      { schema: updateMemberRoute, preHandler: manage },
      controller.update,
    )
    app.delete(
      '/orgs/:orgId/members/:memberId',
      { schema: removeMemberRoute, preHandler: manage },
      controller.remove,
    )
    app.post(
      '/orgs/:orgId/members/:memberId/deactivate',
      { schema: deactivateMemberRoute, preHandler: manage },
      controller.deactivate,
    )
    app.post(
      '/orgs/:orgId/members/:memberId/reactivate',
      { schema: reactivateMemberRoute, preHandler: manage },
      controller.reactivate,
    )
    return Promise.resolve()
  }
}
