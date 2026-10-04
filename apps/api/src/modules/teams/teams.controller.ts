// SPDX-License-Identifier: AGPL-3.0-only
import type {
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
import type { TeamsService } from './teams.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListTeams = typeof listTeamsRoute
type CreateTeam = typeof createTeamRoute
type GetTeam = typeof getTeamRoute
type UpdateTeam = typeof updateTeamRoute
type DeleteTeam = typeof deleteTeamRoute
type DeletionImpact = typeof teamDeletionImpactRoute
type ListTeamMembers = typeof listTeamMembersRoute
type AddTeamMembers = typeof addTeamMembersRoute
type RemoveTeamMember = typeof removeTeamMemberRoute

export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  list = async (request: ZodRequest<ListTeams>, reply: ZodReply<ListTeams>) => {
    const { items, nextCursor } = await this.teamsService.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  create = async (request: ZodRequest<CreateTeam>, reply: ZodReply<CreateTeam>) => {
    reply.created(await this.teamsService.create(request.tenant, request.body))
  }

  get = async (request: ZodRequest<GetTeam>, reply: ZodReply<GetTeam>) => {
    reply.ok(await this.teamsService.get(request.tenant, request.params.teamId))
  }

  update = async (request: ZodRequest<UpdateTeam>, reply: ZodReply<UpdateTeam>) => {
    reply.ok(await this.teamsService.update(request.tenant, request.params.teamId, request.body))
  }

  delete = async (request: ZodRequest<DeleteTeam>, reply: ZodReply<DeleteTeam>) => {
    await this.teamsService.delete(request.tenant, request.params.teamId)
    reply.noContent()
  }

  deletionImpact = async (request: ZodRequest<DeletionImpact>, reply: ZodReply<DeletionImpact>) => {
    reply.ok(await this.teamsService.deletionImpact(request.tenant, request.params.teamId))
  }

  listMembers = async (request: ZodRequest<ListTeamMembers>, reply: ZodReply<ListTeamMembers>) => {
    const { items, nextCursor } = await this.teamsService.listMembers(
      request.tenant,
      request.params.teamId,
      request.query,
    )
    reply.page(items, nextCursor)
  }

  addMembers = async (request: ZodRequest<AddTeamMembers>, reply: ZodReply<AddTeamMembers>) => {
    reply.ok(
      await this.teamsService.addMembers(request.tenant, request.params.teamId, request.body),
    )
  }

  removeMember = async (
    request: ZodRequest<RemoveTeamMember>,
    reply: ZodReply<RemoveTeamMember>,
  ) => {
    await this.teamsService.removeMember(
      request.tenant,
      request.params.teamId,
      request.params.userId,
    )
    reply.noContent()
  }
}
