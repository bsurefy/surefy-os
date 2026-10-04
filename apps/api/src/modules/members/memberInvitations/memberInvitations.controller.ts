// SPDX-License-Identifier: AGPL-3.0-only
import type {
  acceptInvitationRoute,
  createInvitationRoute,
  invitationLinkRoute,
  listInvitationsRoute,
  previewInvitationRoute,
  requestReissueRoute,
  resendInvitationRoute,
  revokeInvitationRoute,
} from './memberInvitations.schema.js'
import type { MemberInvitationsService } from './memberInvitations.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListInvitations = typeof listInvitationsRoute
type CreateInvitation = typeof createInvitationRoute
type ResendInvitation = typeof resendInvitationRoute
type InvitationLink = typeof invitationLinkRoute
type RevokeInvitation = typeof revokeInvitationRoute
type PreviewInvitation = typeof previewInvitationRoute
type AcceptInvitation = typeof acceptInvitationRoute
type RequestReissue = typeof requestReissueRoute

export class MemberInvitationsController {
  constructor(private readonly invitationsService: MemberInvitationsService) {}

  list = async (request: ZodRequest<ListInvitations>, reply: ZodReply<ListInvitations>) => {
    const { items, nextCursor } = await this.invitationsService.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  create = async (request: ZodRequest<CreateInvitation>, reply: ZodReply<CreateInvitation>) => {
    reply.created(await this.invitationsService.create(request.tenant, request.body))
  }

  resend = async (request: ZodRequest<ResendInvitation>, reply: ZodReply<ResendInvitation>) => {
    reply.ok(await this.invitationsService.resend(request.tenant, request.params.invitationId))
  }

  link = async (request: ZodRequest<InvitationLink>, reply: ZodReply<InvitationLink>) => {
    reply.ok(await this.invitationsService.link(request.tenant, request.params.invitationId))
  }

  revoke = async (request: ZodRequest<RevokeInvitation>, reply: ZodReply<RevokeInvitation>) => {
    reply.ok(await this.invitationsService.revoke(request.tenant, request.params.invitationId))
  }

  preview = async (request: ZodRequest<PreviewInvitation>, reply: ZodReply<PreviewInvitation>) => {
    reply.ok(await this.invitationsService.preview(request.params.token))
  }

  accept = async (request: ZodRequest<AcceptInvitation>, reply: ZodReply<AcceptInvitation>) => {
    reply.ok(await this.invitationsService.accept(request.auth, request.params.token))
  }

  requestReissue = async (request: ZodRequest<RequestReissue>, reply: ZodReply<RequestReissue>) => {
    await this.invitationsService.requestReissue(request.params.token)
    reply.noContent()
  }
}
