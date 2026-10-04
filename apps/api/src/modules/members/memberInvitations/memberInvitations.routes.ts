// SPDX-License-Identifier: AGPL-3.0-only
import { RATE_LIMITS } from '@/constants/rateLimits.js'
import { PERMISSIONS } from '@surefy/contracts'

import {
  acceptInvitationRoute,
  createInvitationRoute,
  invitationLinkRoute,
  listInvitationsRoute,
  previewInvitationRoute,
  requestReissueRoute,
  resendInvitationRoute,
  revokeInvitationRoute,
} from './memberInvitations.schema.js'

import type { MemberInvitationsController } from './memberInvitations.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function memberInvitationsRoutes(
  controller: MemberInvitationsController,
): FastifyPluginAsyncZod {
  return (app) => {
    const invite = app.authorize(PERMISSIONS.MEMBERS_INVITE)
    const publicLookup = { public: true, rateLimit: RATE_LIMITS.publicLookup }
    app.get(
      '/orgs/:orgId/invitations',
      { schema: listInvitationsRoute, preHandler: invite },
      controller.list,
    )
    app.post(
      '/orgs/:orgId/invitations',
      { schema: createInvitationRoute, preHandler: invite },
      controller.create,
    )
    app.post(
      '/orgs/:orgId/invitations/:invitationId/resend',
      { schema: resendInvitationRoute, preHandler: invite },
      controller.resend,
    )
    app.post(
      '/orgs/:orgId/invitations/:invitationId/link',
      { schema: invitationLinkRoute, preHandler: invite },
      controller.link,
    )
    app.post(
      '/orgs/:orgId/invitations/:invitationId/revoke',
      { schema: revokeInvitationRoute, preHandler: invite },
      controller.revoke,
    )
    app.get(
      '/invitations/:token',
      { schema: previewInvitationRoute, config: publicLookup },
      controller.preview,
    )
    app.post(
      '/invitations/:token/accept',
      { schema: acceptInvitationRoute, preHandler: app.authenticate() },
      controller.accept,
    )
    app.post(
      '/invitations/:token/request-reissue',
      { schema: requestReissueRoute, config: publicLookup },
      controller.requestReissue,
    )
    return Promise.resolve()
  }
}
