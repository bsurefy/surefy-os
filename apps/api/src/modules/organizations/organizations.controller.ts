// SPDX-License-Identifier: AGPL-3.0-only
import type {
  createOrganizationRoute,
  getOrganizationRoute,
  slugAvailabilityRoute,
  updateOrganizationRoute,
} from './organizations.schema.js'
import type { OrganizationsService } from './organizations.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type GetOrganization = typeof getOrganizationRoute
type UpdateOrganization = typeof updateOrganizationRoute
type CreateOrganization = typeof createOrganizationRoute
type SlugAvailability = typeof slugAvailabilityRoute

export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  get = async (request: ZodRequest<GetOrganization>, reply: ZodReply<GetOrganization>) => {
    reply.ok(await this.organizationsService.get(request.tenant))
  }

  update = async (request: ZodRequest<UpdateOrganization>, reply: ZodReply<UpdateOrganization>) => {
    reply.ok(await this.organizationsService.update(request.tenant, request.body))
  }

  create = async (request: ZodRequest<CreateOrganization>, reply: ZodReply<CreateOrganization>) => {
    reply.created(await this.organizationsService.create(request.auth, request.body))
  }

  slugAvailability = async (
    request: ZodRequest<SlugAvailability>,
    reply: ZodReply<SlugAvailability>,
  ) => {
    reply.ok(await this.organizationsService.slugAvailability(request.query.slug))
  }
}
