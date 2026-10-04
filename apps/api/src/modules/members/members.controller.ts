// SPDX-License-Identifier: AGPL-3.0-only
import type { MemberPreferencesService } from './memberPreferences/memberPreferences.service.js'
import type {
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
import type { MembersService } from './members.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListMembers = typeof listMembersRoute
type GetMember = typeof getMemberRoute
type UpdateMember = typeof updateMemberRoute
type RemoveMember = typeof removeMemberRoute
type DeactivateMember = typeof deactivateMemberRoute
type ReactivateMember = typeof reactivateMemberRoute
type BulkMemberAction = typeof bulkMemberActionRoute
type GetPreferences = typeof getMemberPreferencesRoute
type UpdatePreferences = typeof updateMemberPreferencesRoute

export class MembersController {
  constructor(
    private readonly membersService: MembersService,
    private readonly memberPreferencesService: MemberPreferencesService,
  ) {}

  list = async (request: ZodRequest<ListMembers>, reply: ZodReply<ListMembers>) => {
    const { items, nextCursor } = await this.membersService.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  get = async (request: ZodRequest<GetMember>, reply: ZodReply<GetMember>) => {
    reply.ok(await this.membersService.get(request.tenant, request.params.memberId))
  }

  update = async (request: ZodRequest<UpdateMember>, reply: ZodReply<UpdateMember>) => {
    reply.ok(
      await this.membersService.update(request.tenant, request.params.memberId, request.body),
    )
  }

  remove = async (request: ZodRequest<RemoveMember>, reply: ZodReply<RemoveMember>) => {
    await this.membersService.remove(request.tenant, request.params.memberId, request.query)
    reply.noContent()
  }

  deactivate = async (request: ZodRequest<DeactivateMember>, reply: ZodReply<DeactivateMember>) => {
    reply.ok(await this.membersService.deactivate(request.tenant, request.params.memberId))
  }

  reactivate = async (request: ZodRequest<ReactivateMember>, reply: ZodReply<ReactivateMember>) => {
    reply.ok(await this.membersService.reactivate(request.tenant, request.params.memberId))
  }

  bulk = async (request: ZodRequest<BulkMemberAction>, reply: ZodReply<BulkMemberAction>) => {
    reply.ok(await this.membersService.bulk(request.tenant, request.body))
  }

  getPreferences = async (request: ZodRequest<GetPreferences>, reply: ZodReply<GetPreferences>) => {
    reply.ok(await this.memberPreferencesService.get(request.tenant))
  }

  updatePreferences = async (
    request: ZodRequest<UpdatePreferences>,
    reply: ZodReply<UpdatePreferences>,
  ) => {
    reply.ok(await this.memberPreferencesService.update(request.tenant, request.body))
  }
}
