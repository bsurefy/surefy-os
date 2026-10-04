// SPDX-License-Identifier: AGPL-3.0-only
import { UnauthorizedError } from '@/core/errors/index.js'
import { MailError } from '@/integrations/mail/index.js'
import { decodeCursor, encodeCursor } from '@/lib/pagination.js'
import {
  AUDIT_ACTIONS,
  PAGE_SIZE,
  type AddInstallAdminInput,
  type InstallAdminDto,
  type InstallOrganizationDto,
  type InstallSettingsDto,
  type ListInstallOrganizationsQuery,
  type SendTestEmailInput,
  type UpdateInstallSettingsInput,
} from '@surefy/contracts'

import {
  InstallAdminExistsError,
  InstallAdminNotFoundError,
  InstallLastAdminError,
  InstallSmtpNotConfiguredError,
  InstallSmtpTestFailedError,
  InstallUserNotFoundError,
} from './install.errors.js'
import {
  toInstallAdminDto,
  toInstallOrganizationDto,
  toInstallSettingsDto,
} from './install.mapper.js'
import {
  DATA_KEY_AAD,
  masterKeyIdOf,
  masterKeyOf,
  newDataKey,
  seal,
  SMTP_PASSWORD_AAD,
  unseal,
} from './installSecrets.js'
import { resolveInstallSettings } from './installSettings/installSettings.service.js'

import type {
  InstallRepository,
  InstallSettingsPatch,
  InstallSettingsRow,
} from './install.repository.js'
import type {
  InstallAudit,
  InstallOrganizationLogos,
  SmtpTestMailerFactory,
} from './install.types.js'
import type { InstallSettingsService } from './installSettings/installSettings.service.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { StoredInstallSettings } from '@/database/tables/index.js'
import type { AuthUsersService } from '@/modules/auth/index.js'
import type { InstallLimitsSource } from '@/modules/organizations/index.js'
import type { ActorContext } from '@/types/context.js'

export interface InstallServiceDeps {
  config: Config
  db: Database
  installRepository: InstallRepository
  settings: InstallSettingsService
  users: Pick<AuthUsersService, 'findById' | 'findUserRefs'>
  installLimits: InstallLimitsSource
  logos: InstallOrganizationLogos
  audit: InstallAudit
  smtpTestMailer: SmtpTestMailerFactory
  /** The running version (the API package's). */
  version: string
}

type SmtpInput = NonNullable<UpdateInstallSettingsInput['smtp']>

const actingUser = (actor: ActorContext | null): string => {
  if (actor?.userId == null) throw new UnauthorizedError()
  return actor.userId
}

/** The settings JSON after a PATCH: only the sections the request names change. */
const mergeSettings = (
  stored: StoredInstallSettings,
  input: UpdateInstallSettingsInput,
): StoredInstallSettings => {
  const next: StoredInstallSettings = { ...stored, version: 1 }
  if (input.signIn !== undefined) {
    next.signIn = {
      ...stored.signIn,
      ...(input.signIn.emailPassword === undefined
        ? {}
        : { emailPassword: input.signIn.emailPassword }),
      oauth: { ...stored.signIn?.oauth, ...input.signIn.oauth },
    }
  }
  if (input.smtp !== undefined) {
    next.smtp =
      input.smtp === null
        ? null
        : {
            host: input.smtp.host,
            port: input.smtp.port,
            secure: input.smtp.secure,
            username: input.smtp.username,
            fromAddress: input.smtp.fromAddress,
            fromName: input.smtp.fromName,
          }
  }
  if (input.webSearch !== undefined) next.webSearch = { searxngUrl: input.webSearch.searxngUrl }
  return next
}

/** The top-level fields a PATCH names, for the audit entry (never their values). */
const changedFields = (input: UpdateInstallSettingsInput): string[] =>
  (Object.keys(input) as (keyof UpdateInstallSettingsInput)[]).filter(
    (key) => input[key] !== undefined,
  )

const CLEARED_SMTP_PASSWORD: InstallSettingsPatch = {
  smtpPasswordCiphertext: null,
  smtpPasswordIv: null,
  smtpPasswordAuthTag: null,
  smtpPasswordDataKeyVersion: null,
}

/** `"Name" <address>`, or the bare address. */
const fromHeader = (address: string, name: string | null): string =>
  name === null ? address : `"${name.replaceAll(/["\\\r\n]/g, '')}" <${address}>`

/**
 * Settings › Install of a self-hosted install (organizations-and-members.md, §9–10): the install
 * settings, the SMTP test, install administrators and every organization on the install. Every
 * route is for install administrators only.
 */
export class InstallService {
  constructor(private readonly deps: InstallServiceDeps) {}

  async getSettings(): Promise<InstallSettingsDto> {
    const resolved = await this.deps.settings.read()
    return this.toSettingsDto(resolved.row)
  }

  async updateSettings(
    actor: ActorContext | null,
    input: UpdateInstallSettingsInput,
  ): Promise<InstallSettingsDto> {
    actingUser(actor)
    const repository = this.deps.installRepository
    const row = await this.deps.db.global.transaction(async (tx) => {
      const current = await repository.lockSettings(tx)
      const patch: InstallSettingsPatch = {
        ...(input.signupPolicy === undefined ? {} : { signupPolicy: input.signupPolicy }),
        ...(input.orgCreationPolicy === undefined
          ? {}
          : { orgCreationPolicy: input.orgCreationPolicy }),
        settings: mergeSettings(current.settings, input),
        ...this.smtpPasswordPatch(current, input.smtp),
      }
      return repository.updateSettings(tx, patch)
    })
    this.deps.settings.invalidate()
    if (actor !== null) {
      await this.deps.audit.recordInstallChange({
        action: AUDIT_ACTIONS.INSTALL_SETTINGS_UPDATED,
        actor,
        targetUserId: null,
        changes: changedFields(input),
      })
    }
    return this.toSettingsDto(row)
  }

  /** One message through the stored SMTP settings; the password is decrypted in memory only. */
  async sendTestEmail(input: SendTestEmailInput): Promise<void> {
    const row = await this.deps.installRepository.getSettings(this.deps.db.global)
    const { settings } = resolveInstallSettings(row)
    if (settings.smtp === null) throw new InstallSmtpNotConfiguredError()
    const { smtp } = settings
    const password = this.decryptSmtpPassword(row)
    const mailer = this.deps.smtpTestMailer({
      from: fromHeader(smtp.fromAddress, smtp.fromName),
      smtp: {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        ...(smtp.username === null ? {} : { user: smtp.username }),
        ...(password === undefined ? {} : { password }),
      },
    })
    const appName = this.deps.config.app.name
    try {
      await mailer.send({
        to: input.to,
        subject: `${appName} test email`,
        text: `This is a test message from ${appName}. Your email server settings work.`,
        html: `<p>This is a test message from ${appName}. Your email server settings work.</p>`,
      })
    } catch (error) {
      if (error instanceof MailError) throw new InstallSmtpTestFailedError({ cause: error })
      throw error
    } finally {
      await mailer.close()
    }
  }

  async listAdmins(): Promise<InstallAdminDto[]> {
    const rows = await this.deps.installRepository.listAdmins(this.deps.db.global)
    const refs = await this.deps.users.findUserRefs(rows.map((row) => row.userId))
    return rows.flatMap((row) => {
      const user = refs.get(row.userId)
      return user === undefined ? [] : [toInstallAdminDto(row, user)]
    })
  }

  /** The person must already have an account. */
  async addAdmin(
    actor: ActorContext | null,
    input: AddInstallAdminInput,
  ): Promise<InstallAdminDto> {
    const actorId = actingUser(actor)
    if ((await this.deps.users.findById(input.userId)) === undefined) {
      throw new InstallUserNotFoundError()
    }
    const row = await this.deps.installRepository.insertAdmin(this.deps.db.global, {
      userId: input.userId,
      grantedByUserId: actorId,
    })
    if (row === undefined) throw new InstallAdminExistsError()
    const refs = await this.deps.users.findUserRefs([row.userId])
    const user = refs.get(row.userId)
    if (user === undefined) throw new InstallUserNotFoundError()
    if (actor !== null) {
      await this.deps.audit.recordInstallChange({
        action: AUDIT_ACTIONS.INSTALL_ADMIN_ADDED,
        actor,
        targetUserId: row.userId,
      })
    }
    return toInstallAdminDto(row, user)
  }

  /** Locks every administrator row, so concurrent removals cannot remove the last one. */
  async removeAdmin(actor: ActorContext | null, userId: string): Promise<void> {
    actingUser(actor)
    const repository = this.deps.installRepository
    await this.deps.db.global.transaction(async (tx) => {
      const adminIds = await repository.lockAdminIds(tx)
      if (!adminIds.includes(userId)) throw new InstallAdminNotFoundError()
      if (adminIds.length <= 1) throw new InstallLastAdminError()
      await repository.deleteAdmin(tx, userId)
    })
    if (actor !== null) {
      await this.deps.audit.recordInstallChange({
        action: AUDIT_ACTIONS.INSTALL_ADMIN_REMOVED,
        actor,
        targetUserId: userId,
      })
    }
  }

  /** Every organization on the install, keyset on id (definer `install_list_organizations`). */
  async listOrganizations(
    query: ListInstallOrganizationsQuery,
  ): Promise<{ items: InstallOrganizationDto[]; nextCursor: string | null }> {
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor).id
    // One extra row tells whether another page follows; the function returns at most PAGE_SIZE.max.
    const fetch = Math.min(query.limit + 1, PAGE_SIZE.max)
    const rows = await this.deps.installRepository.listOrganizations(
      this.deps.db.global,
      after,
      fetch,
    )
    const items = rows.slice(0, query.limit)
    const last = items.at(-1)
    const hasMore = rows.length > query.limit || (rows.length === fetch && fetch === query.limit)
    const nextCursor =
      hasMore && last !== undefined
        ? encodeCursor({ k: last.organizationId, id: last.organizationId })
        : null
    return {
      items: await Promise.all(
        items.map(async (row) =>
          toInstallOrganizationDto(row, await this.deps.logos.logoUrl(row.logoObjectKey)),
        ),
      ),
      nextCursor,
    }
  }

  private async toSettingsDto(row: InstallSettingsRow): Promise<InstallSettingsDto> {
    const [count, limits] = await Promise.all([
      this.deps.installRepository.countOrganizations(this.deps.db.global),
      this.deps.installLimits.getInstallLimits(),
    ])
    return toInstallSettingsDto(resolveInstallSettings(row), {
      config: this.deps.config,
      version: this.deps.version,
      organizations: { count, max: limits.maxOrganizations },
    })
  }

  /**
   * The SMTP password columns after a PATCH: `smtp: null` clears it, an absent `password` keeps
   * it, `null` clears it and a value is encrypted with the install data key (created on first use,
   * under the caller's row lock).
   */
  private smtpPasswordPatch(
    current: InstallSettingsRow,
    smtp: SmtpInput | null | undefined,
  ): InstallSettingsPatch {
    if (smtp === undefined) return {}
    if (smtp === null || smtp.password === null) return CLEARED_SMTP_PASSWORD
    if (smtp.password === undefined) return {}
    const { dataKey, patch } = this.dataKeyOf(current)
    const sealed = seal(dataKey, Buffer.from(smtp.password, 'utf8'), SMTP_PASSWORD_AAD)
    return {
      ...patch,
      smtpPasswordCiphertext: sealed.ciphertext,
      smtpPasswordIv: sealed.iv,
      smtpPasswordAuthTag: sealed.authTag,
      smtpPasswordDataKeyVersion: 1,
    }
  }

  /** The install data key: unwrapped from the row, or a new one with the columns to store. */
  private dataKeyOf(row: InstallSettingsRow): { dataKey: Buffer; patch: InstallSettingsPatch } {
    const masterKey = masterKeyOf(this.deps.config.crypto.encryptionKey)
    if (row.dataKeyWrapped !== null && row.dataKeyIv !== null && row.dataKeyAuthTag !== null) {
      const dataKey = unseal(
        masterKey,
        { ciphertext: row.dataKeyWrapped, iv: row.dataKeyIv, authTag: row.dataKeyAuthTag },
        DATA_KEY_AAD,
      )
      return { dataKey, patch: {} }
    }
    const dataKey = newDataKey()
    const wrapped = seal(masterKey, dataKey, DATA_KEY_AAD)
    return {
      dataKey,
      patch: {
        dataKeyWrapped: wrapped.ciphertext,
        dataKeyIv: wrapped.iv,
        dataKeyAuthTag: wrapped.authTag,
        dataKeyMasterKeyId: masterKeyIdOf(masterKey),
      },
    }
  }

  private decryptSmtpPassword(row: InstallSettingsRow): string | undefined {
    if (
      row.smtpPasswordCiphertext === null ||
      row.smtpPasswordIv === null ||
      row.smtpPasswordAuthTag === null
    ) {
      return undefined
    }
    const { dataKey } = this.dataKeyOf(row)
    return unseal(
      dataKey,
      {
        ciphertext: row.smtpPasswordCiphertext,
        iv: row.smtpPasswordIv,
        authTag: row.smtpPasswordAuthTag,
      },
      SMTP_PASSWORD_AAD,
    ).toString('utf8')
  }
}
