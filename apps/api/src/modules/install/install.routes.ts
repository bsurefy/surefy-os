// SPDX-License-Identifier: AGPL-3.0-only
import { UnauthorizedError } from '@/core/errors/index.js'
import { defineGuard } from '@/plugins/access.plugin.js'

import { InstallAdminRequiredError } from './install.errors.js'
import {
  addInstallAdminRoute,
  getInstallSettingsRoute,
  listInstallAdminsRoute,
  listInstallOrganizationsRoute,
  removeInstallAdminRoute,
  sendTestEmailRoute,
  updateInstallSettingsRoute,
} from './install.schema.js'

import type { InstallController } from './install.controller.js'
import type { InstallAdminsReader } from '@/modules/auth/index.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * The install routes' guard: membership in `install_admins` (organizations-and-members.md, §10).
 * No organization permission applies; it follows `app.authenticate()`.
 */
export const authorizeInstallAdmin = (admins: InstallAdminsReader) =>
  defineGuard('authorizeInstallAdmin', async (request) => {
    const userId = request.auth?.userId
    if (userId == null) throw new UnauthorizedError()
    if (!(await admins.isInstallAdmin(userId))) throw new InstallAdminRequiredError()
  })

export function installRoutes(
  controller: InstallController,
  admins: InstallAdminsReader,
): FastifyPluginAsyncZod {
  return (app) => {
    const preHandler = [app.authenticate(), authorizeInstallAdmin(admins)]
    app.get(
      '/install/settings',
      { schema: getInstallSettingsRoute, preHandler },
      controller.getSettings,
    )
    app.patch(
      '/install/settings',
      { schema: updateInstallSettingsRoute, preHandler },
      controller.updateSettings,
    )
    app.post(
      '/install/smtp/test',
      { schema: sendTestEmailRoute, preHandler },
      controller.sendTestEmail,
    )
    app.get(
      '/install/admins',
      { schema: listInstallAdminsRoute, preHandler },
      controller.listAdmins,
    )
    app.post('/install/admins', { schema: addInstallAdminRoute, preHandler }, controller.addAdmin)
    app.delete(
      '/install/admins/:userId',
      { schema: removeInstallAdminRoute, preHandler },
      controller.removeAdmin,
    )
    app.get(
      '/install/organizations',
      { schema: listInstallOrganizationsRoute, preHandler },
      controller.listOrganizations,
    )
    return Promise.resolve()
  }
}
