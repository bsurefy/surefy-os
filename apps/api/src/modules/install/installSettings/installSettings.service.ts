// SPDX-License-Identifier: AGPL-3.0-only
import { installSettingsSchema, type InstallSettings } from '@surefy/contracts'

import { INSTALL_SETTINGS_CACHE_MS } from '../install.constants.js'

import type { InstallRepository, InstallSettingsRow } from '../install.repository.js'
import type { SignupPolicy } from '@/core/auth/index.js'
import type { Database, DbTransaction } from '@/core/database/index.js'
import type { InstallAdminsReader, SignupStatus } from '@/modules/auth/index.js'
import type { OrganizationCreationRule } from '@/modules/organizations/index.js'

export interface InstallSettingsServiceDeps {
  db: Database
  installRepository: InstallRepository
  /** Milliseconds since the epoch (tests). */
  now?: () => number
}

/** The settings row with its `InstallSettings` JSON read with the contract defaults. */
export interface ResolvedInstallSettings {
  row: InstallSettingsRow
  settings: InstallSettings
}

export const resolveInstallSettings = (row: InstallSettingsRow): ResolvedInstallSettings => ({
  row,
  settings: installSettingsSchema.parse(row.settings),
})

/**
 * The install's policies as the other modules ask them: the sign-up policy (Better Auth), install
 * administration (`/me`), the organization creation policy (organizations) and the setup state.
 * Built before the organizations and auth modules, like the membership primitives.
 */
export class InstallSettingsService
  implements SignupPolicy, SignupStatus, InstallAdminsReader, OrganizationCreationRule
{
  private cached: { value: ResolvedInstallSettings; at: number } | undefined

  constructor(private readonly deps: InstallSettingsServiceDeps) {}

  /** The settings, from a short in-memory cache (`INSTALL_SETTINGS_CACHE_MS`). */
  async read(): Promise<ResolvedInstallSettings> {
    const now = this.now()
    if (this.cached !== undefined && now - this.cached.at < INSTALL_SETTINGS_CACHE_MS) {
      return this.cached.value
    }
    const value = resolveInstallSettings(
      await this.deps.installRepository.getSettings(this.deps.db.global),
    )
    this.cached = { value, at: now }
    return value
  }

  /** After a change in this process, the next read goes to the database. */
  invalidate(): void {
    this.cached = undefined
  }

  /** Open sign-up lets anyone create an account; invitations are checked by the members module. */
  async allows(): Promise<boolean> {
    return this.isSignupOpen()
  }

  async isSignupOpen(): Promise<boolean> {
    const { row } = await this.read()
    return row.signupPolicy === 'open'
  }

  isInstallAdmin(userId: string): Promise<boolean> {
    return this.deps.installRepository.isAdmin(this.deps.db.global, userId)
  }

  /**
   * `org_creation_policy`: install administrators only, or any signed-in person. The organization
   * limit of the entitlement source is checked by the organizations module.
   */
  async mayCreateOrganization(userId: string): Promise<boolean> {
    const { row } = await this.read()
    if (row.orgCreationPolicy === 'any_user') return true
    return this.isInstallAdmin(userId)
  }

  /** Transaction-participating: first-run setup makes the first Owner the first administrator. */
  async insertFirstAdminInTx(tx: DbTransaction, userId: string): Promise<void> {
    await this.deps.installRepository.insertAdmin(tx, { userId, grantedByUserId: null })
  }

  /** When setup was finished or its remaining steps left; null before. */
  async setupCompletedAt(): Promise<Date | null> {
    const { row } = await this.read()
    return row.setupCompletedAt
  }

  /** Sets `setup_completed_at` the first time setup is finished; later calls keep it. */
  async markSetupCompleted(): Promise<void> {
    await this.deps.installRepository.markSetupCompleted(this.deps.db.global)
    this.invalidate()
  }

  /** Whether "Send test email" and invitations by email have an SMTP server to use. */
  async isSmtpConfigured(): Promise<boolean> {
    const { settings } = await this.read()
    return settings.smtp !== null
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}
