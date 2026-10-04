// SPDX-License-Identifier: AGPL-3.0-only
import type {
  addInstallAdminRoute,
  getInstallSettingsRoute,
  listInstallAdminsRoute,
  listInstallOrganizationsRoute,
  removeInstallAdminRoute,
  sendTestEmailRoute,
  updateInstallSettingsRoute,
} from './install.schema.js'
import type { InstallService } from './install.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type GetSettings = typeof getInstallSettingsRoute
type UpdateSettings = typeof updateInstallSettingsRoute
type SendTestEmail = typeof sendTestEmailRoute
type ListAdmins = typeof listInstallAdminsRoute
type AddAdmin = typeof addInstallAdminRoute
type RemoveAdmin = typeof removeInstallAdminRoute
type ListOrganizations = typeof listInstallOrganizationsRoute

export class InstallController {
  constructor(private readonly installService: InstallService) {}

  getSettings = async (_request: ZodRequest<GetSettings>, reply: ZodReply<GetSettings>) => {
    reply.ok(await this.installService.getSettings())
  }

  updateSettings = async (request: ZodRequest<UpdateSettings>, reply: ZodReply<UpdateSettings>) => {
    reply.ok(await this.installService.updateSettings(request.auth, request.body))
  }

  sendTestEmail = async (request: ZodRequest<SendTestEmail>, reply: ZodReply<SendTestEmail>) => {
    await this.installService.sendTestEmail(request.body)
    reply.noContent()
  }

  listAdmins = async (_request: ZodRequest<ListAdmins>, reply: ZodReply<ListAdmins>) => {
    reply.ok(await this.installService.listAdmins())
  }

  addAdmin = async (request: ZodRequest<AddAdmin>, reply: ZodReply<AddAdmin>) => {
    reply.created(await this.installService.addAdmin(request.auth, request.body))
  }

  removeAdmin = async (request: ZodRequest<RemoveAdmin>, reply: ZodReply<RemoveAdmin>) => {
    await this.installService.removeAdmin(request.auth, request.params.userId)
    reply.noContent()
  }

  listOrganizations = async (
    request: ZodRequest<ListOrganizations>,
    reply: ZodReply<ListOrganizations>,
  ) => {
    const { items, nextCursor } = await this.installService.listOrganizations(request.query)
    reply.page(items, nextCursor)
  }
}
