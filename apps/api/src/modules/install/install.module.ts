// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs'

import { ORGANIZATIONS_DEFAULTS } from '@/modules/organizations/index.js'

import { INSTALL_DEFAULTS } from './install.constants.js'
import { InstallController } from './install.controller.js'
import { InstallRepository } from './install.repository.js'
import { installRoutes } from './install.routes.js'
import { InstallService } from './install.service.js'
import { InstallSettingsService } from './installSettings/installSettings.service.js'

import type {
  InstallAudit,
  InstallOrganizationLogos,
  SmtpTestMailerFactory,
} from './install.types.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { AuthUsersService } from '@/modules/auth/index.js'
import type { InstallLimitsSource } from '@/modules/organizations/index.js'

/**
 * The install's settings and policies, built in step 2 of the composition root before the
 * organizations and auth modules, which ask its sign-up, creation and administrator rules.
 */
export function createInstallSettings(deps: { db: Database }) {
  const repository = new InstallRepository()
  return {
    repository,
    service: new InstallSettingsService({ db: deps.db, installRepository: repository }),
  }
}
export type InstallSettings = ReturnType<typeof createInstallSettings>

export interface InstallModuleDeps {
  config: Config
  db: Database
  settings: InstallSettings
  users: Pick<AuthUsersService, 'findById' | 'findUserRefs'>
  logos: InstallOrganizationLogos
  /** The entitlement source's install limits (access module); Community's by default. */
  installLimits?: InstallLimitsSource
  /** The audit module's install log; not recorded by default. */
  audit?: InstallAudit
  /** "Send test email" transport (tests). */
  smtpTestMailer?: SmtpTestMailerFactory
}

/** The product version shown in Settings › Install: the API package's own version. */
const readVersion = (): string => {
  const raw = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
  const { version } = JSON.parse(raw) as { version?: unknown }
  return typeof version === 'string' ? version : '0.0.0'
}

export function createInstallModule(deps: InstallModuleDeps) {
  const service = new InstallService({
    config: deps.config,
    db: deps.db,
    installRepository: deps.settings.repository,
    settings: deps.settings.service,
    users: deps.users,
    installLimits: deps.installLimits ?? ORGANIZATIONS_DEFAULTS.installLimits,
    logos: deps.logos,
    audit: deps.audit ?? INSTALL_DEFAULTS.audit,
    smtpTestMailer: deps.smtpTestMailer ?? INSTALL_DEFAULTS.smtpTestMailer,
    version: readVersion(),
  })
  return {
    service,
    settings: deps.settings.service,
    routes: installRoutes(new InstallController(service), deps.settings.service),
  }
}
export type InstallModule = ReturnType<typeof createInstallModule>
