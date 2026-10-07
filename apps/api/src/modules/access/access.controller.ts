// SPDX-License-Identifier: AGPL-3.0-only
import type {
  getMemberAccessRoute,
  getMyAccessRoute,
  getOrganizationPolicyRoute,
  getTeamAccessRoute,
  getTeamPolicyRoute,
  updateOrganizationPolicyRoute,
  updateTeamPolicyRoute,
} from './access.schema.js'
import type { AccessService } from './access.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type GetMine = typeof getMyAccessRoute
type GetMember = typeof getMemberAccessRoute
type GetTeam = typeof getTeamAccessRoute
type GetOrgPolicy = typeof getOrganizationPolicyRoute
type UpdateOrgPolicy = typeof updateOrganizationPolicyRoute
type GetTeamPolicy = typeof getTeamPolicyRoute
type UpdateTeamPolicy = typeof updateTeamPolicyRoute

export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  /** `app.authorize()` already resolved it for this request. */
  mine = (request: ZodRequest<GetMine>, reply: ZodReply<GetMine>) => {
    reply.ok(request.tenant.access)
    return Promise.resolve()
  }

  member = async (request: ZodRequest<GetMember>, reply: ZodReply<GetMember>) => {
    reply.ok(await this.accessService.getMember(request.tenant, request.params.userId))
  }

  team = async (request: ZodRequest<GetTeam>, reply: ZodReply<GetTeam>) => {
    reply.ok(await this.accessService.getTeam(request.tenant, request.params.teamId))
  }

  organizationPolicy = async (request: ZodRequest<GetOrgPolicy>, reply: ZodReply<GetOrgPolicy>) => {
    reply.ok(await this.accessService.getPolicy(request.tenant, null))
  }

  updateOrganizationPolicy = async (
    request: ZodRequest<UpdateOrgPolicy>,
    reply: ZodReply<UpdateOrgPolicy>,
  ) => {
    reply.ok(await this.accessService.updatePolicy(request.tenant, null, request.body))
  }

  teamPolicy = async (request: ZodRequest<GetTeamPolicy>, reply: ZodReply<GetTeamPolicy>) => {
    reply.ok(await this.accessService.getPolicy(request.tenant, request.params.teamId))
  }

  updateTeamPolicy = async (
    request: ZodRequest<UpdateTeamPolicy>,
    reply: ZodReply<UpdateTeamPolicy>,
  ) => {
    reply.ok(
      await this.accessService.updatePolicy(request.tenant, request.params.teamId, request.body),
    )
  }
}
