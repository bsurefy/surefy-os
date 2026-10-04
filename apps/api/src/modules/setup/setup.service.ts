// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, timingSafeEqual } from 'node:crypto'

import {
  INVITATION_STATUSES,
  SETUP_CHECKLIST_ITEMS,
  type CompleteSetupInput,
  type SetupCheckDto,
  type SetupChecklistDto,
  type SetupInput,
  type SetupResultDto,
  type SetupStatusDto,
  type UserDto,
} from '@surefy/contracts'

import { SETUP_CHECK_CODES, STORAGE_CHECK_KEY } from './setup.constants.js'
import {
  SetupAlreadyCompletedError,
  SetupInvalidTimezoneError,
  SetupOwnerEmailTakenError,
  SetupTokenInvalidError,
} from './setup.errors.js'

import type { SetupRepository } from './setup.repository.js'
import type { SetupAudit, SetupChecklistCheck, SetupGpuProbe } from './setup.types.js'
import type { Auth } from '@/core/auth/index.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'
import type { AuthService } from '@/modules/auth/index.js'
import type { InstallSettingsService } from '@/modules/install/index.js'
import type {
  MemberInvitationsService,
  MemberPreferencesService,
  MembersService,
} from '@/modules/members/index.js'
import type { OrganizationsService } from '@/modules/organizations/index.js'
import type { ActorContext, TenantContext } from '@/types/context.js'

export interface SetupServiceDeps {
  config: Config
  db: Database
  logger: Logger
  auth: Auth
  setupRepository: SetupRepository
  storage: StorageProvider
  install: Pick<
    InstallSettingsService,
    'insertFirstAdminInTx' | 'setupCompletedAt' | 'markSetupCompleted' | 'isSmtpConfigured'
  >
  organizations: Pick<OrganizationsService, 'newOrganizationId' | 'createWithOwnerInTx' | 'update'>
  /** Signs the new Owner's preferences (language, last organization) as that person. */
  profiles: Pick<AuthService, 'updateMe'>
  memberPreferences: Pick<MemberPreferencesService, 'get'>
  members: Pick<MembersService, 'list'>
  invitations: Pick<MemberInvitationsService, 'list'>
  checklist: readonly SetupChecklistCheck[]
  audit: SetupAudit
  gpu: SetupGpuProbe
}

/** The first Owner as Better Auth created them. */
interface CreatedOwner {
  id: string
  name: string
  email: string
  createdAt: Date
  updatedAt: Date
}

/** `POST /setup`'s result and the session cookies of the new Owner. */
export interface SetupOutcome {
  result: SetupResultDto
  cookies: string[]
}

const isTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown error'

/** `Cookie` request header from `Set-Cookie` response headers. */
const cookieHeader = (setCookies: readonly string[]): string =>
  setCookies.map((line) => line.split(';', 1)[0] ?? '').join('; ')

/** A just-created account: verified by setup, no picture, no two-factor yet. */
const toOwnerDto = (owner: CreatedOwner): UserDto => ({
  id: owner.id,
  name: owner.name,
  email: owner.email,
  emailVerified: true,
  imageUrl: null,
  twoFactorEnabled: false,
  createdAt: owner.createdAt.toISOString(),
  updatedAt: owner.updatedAt.toISOString(),
})

/**
 * First-run setup of a self-hosted install (authentication.md, §5; design F1): the server check,
 * the first Owner, organization and install administrator, finishing setup, and the home-screen
 * checklist.
 */
export class SetupService {
  constructor(private readonly deps: SetupServiceDeps) {}

  /** Public. The server check runs only while setup is open; afterwards nothing is probed. */
  async status(): Promise<SetupStatusDto> {
    let databaseError: unknown
    let isComplete = false
    try {
      isComplete = await this.deps.setupRepository.isComplete(this.deps.db.global)
    } catch (error) {
      databaseError = error
    }
    const finishedAt =
      databaseError === undefined ? await this.deps.install.setupCompletedAt() : null
    return {
      isComplete,
      finishedAt: finishedAt?.toISOString() ?? null,
      requiresToken: this.deps.config.setup.token !== undefined,
      checks: isComplete ? [] : await this.checks(databaseError),
    }
  }

  /**
   * `POST /setup`: the token, then the first Owner through Better Auth (server side, so the
   * sign-up policy does not apply), then one transaction under the setup lock that re-checks
   * `setup_is_complete()` and creates the organization, the Owner membership and the first
   * install administrator. A failed transaction deletes the account again. The Owner is signed in.
   */
  async setup(input: SetupInput, headers: Headers, requestId: string): Promise<SetupOutcome> {
    this.assertToken(input.token)
    const { organization } = input
    if (organization.timezone !== undefined && !isTimezone(organization.timezone)) {
      throw new SetupInvalidTimezoneError()
    }
    const repository = this.deps.setupRepository
    if (await repository.isComplete(this.deps.db.global)) throw new SetupAlreadyCompletedError()

    const owner = await this.createOwner(input.owner)
    const orgId = await this.deps.organizations.newOrganizationId()
    let created
    try {
      created = await this.deps.db.tenant(orgId, async (tx) => {
        await repository.lock(tx)
        if (await repository.isComplete(tx)) throw new SetupAlreadyCompletedError()
        const { row } = await this.deps.organizations.createWithOwnerInTx(
          tx,
          orgId,
          {
            name: organization.name,
            slug: organization.slug,
            ...(organization.timezone === undefined ? {} : { timezone: organization.timezone }),
            ...(input.locale === undefined ? {} : { defaultLocale: input.locale }),
          },
          { userId: owner.id, provisioningSource: 'setup' },
        )
        await this.deps.install.insertFirstAdminInTx(tx, owner.id)
        return row
      })
    } catch (error) {
      await this.deleteOwner(owner.id)
      throw error
    }
    await this.deps.audit.recordSetup({ organizationId: orgId, userId: owner.id, requestId })

    const signedIn = await this.signIn(input, owner, orgId, headers, requestId)
    return {
      result: {
        organization: {
          id: created.id,
          name: created.name,
          slug: created.slug,
          logoUrl: null,
          status: created.status,
        },
        user: signedIn.user,
      },
      cookies: signedIn.cookies,
    }
  }

  /**
   * The Owner finished or left the remaining steps: the skipped steps go to the organization's
   * settings (the checklist offers them again) and the install records when setup was finished.
   */
  async complete(ctx: TenantContext, input: CompleteSetupInput): Promise<void> {
    await this.deps.organizations.update(
      { orgId: ctx.orgId, userId: ctx.userId },
      { settings: { setup: { skippedSteps: input.skippedSteps } } },
    )
    await this.deps.install.markSetupCompleted()
  }

  /** The home-screen checklist; items of modules not yet available are left out. */
  async checklist(ctx: TenantContext): Promise<SetupChecklistDto> {
    const checks = new Map(this.checklistChecks().map((check) => [check.key, check]))
    const items = await Promise.all(
      SETUP_CHECKLIST_ITEMS.flatMap((key) => {
        const check = checks.get(key)
        return check === undefined ? [] : [check.isDone(ctx).then((done) => ({ key, done }))]
      }),
    )
    const preferences = await this.deps.memberPreferences.get(ctx)
    return { items, dismissed: preferences.checklistDismissed }
  }

  /** "Invite your team" is done once anyone else joined or was invited. */
  private checklistChecks(): SetupChecklistCheck[] {
    const inviteTeam: SetupChecklistCheck = {
      key: 'invite-team',
      isDone: async (ctx) => {
        const members = await this.deps.members.list(ctx, { limit: 2 })
        if (members.items.length > 1) return true
        const invitations = await this.deps.invitations.list(ctx, {
          limit: 1,
          status: [...INVITATION_STATUSES],
        })
        return invitations.items.length > 0
      },
    }
    return [inviteTeam, ...this.deps.checklist]
  }

  private assertToken(token: string | undefined): void {
    const expected = this.deps.config.setup.token
    if (expected === undefined) return
    if (token === undefined || !timingSafeEqual(digest(token), digest(expected))) {
      throw new SetupTokenInvalidError()
    }
  }

  /** Through Better Auth without a request, then verified: the Owner proved control of the install. */
  private async createOwner(owner: SetupInput['owner']): Promise<CreatedOwner> {
    const { user } = await this.deps.auth.api.signUpEmail({
      body: { name: owner.name, email: owner.email, password: owner.password },
    })
    const context = await this.deps.auth.$context
    // Better Auth answers an existing address with a made-up user instead of an error.
    if ((await context.internalAdapter.findUserById(user.id)) === null) {
      throw new SetupOwnerEmailTakenError()
    }
    await context.internalAdapter.updateUser(user.id, { emailVerified: true })
    return user
  }

  private async deleteOwner(userId: string): Promise<void> {
    try {
      const context = await this.deps.auth.$context
      await context.internalAdapter.deleteUser(userId)
    } catch (error) {
      this.deps.logger.error({ err: error, userId }, 'setup: could not delete the new account')
    }
  }

  /**
   * Signs the Owner in and saves their language and organization as preferences. Setup is
   * committed already, so a failure here leaves the person to sign in instead of failing setup.
   */
  private async signIn(
    input: SetupInput,
    owner: CreatedOwner,
    orgId: string,
    headers: Headers,
    requestId: string,
  ): Promise<{ user: UserDto; cookies: string[] }> {
    try {
      const signIn = await this.deps.auth.api.signInEmail({
        body: { email: input.owner.email, password: input.owner.password },
        headers,
        returnHeaders: true,
      })
      const cookies = signIn.headers.getSetCookie()
      const session = await this.deps.auth.api.getSession({
        headers: new Headers({ cookie: cookieHeader(cookies) }),
      })
      if (session === null) return { user: toOwnerDto(owner), cookies }
      const actor: ActorContext = {
        userId: owner.id,
        requestId,
        via: 'user',
        session: {
          id: session.session.id,
          app: 'workspace',
          createdAt: session.session.createdAt,
          expiresAt: session.session.expiresAt,
        },
      }
      const me = await this.deps.profiles.updateMe(actor, {
        lastOrganizationId: orgId,
        ...(input.locale === undefined ? {} : { locale: input.locale }),
      })
      return { user: me.user, cookies }
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'setup: the new Owner could not be signed in')
      return { user: toOwnerDto(owner), cookies: [] }
    }
  }

  /** The Welcome step: server, database, storage, email and GPU. */
  private async checks(databaseError: unknown): Promise<SetupCheckDto[]> {
    const databaseOk = databaseError === undefined
    const [storage, email, gpu] = await Promise.all([
      this.storageCheck(),
      this.emailCheck(databaseOk),
      this.deps.gpu.hasGpu().catch(() => false),
    ])
    return [
      { key: 'server', status: 'ok', blocking: true, code: null, detail: null },
      databaseOk
        ? { key: 'database', status: 'ok', blocking: true, code: null, detail: null }
        : {
            key: 'database',
            status: 'failed',
            blocking: true,
            code: SETUP_CHECK_CODES.DATABASE_UNREACHABLE,
            detail: errorText(databaseError),
          },
      storage,
      email,
      gpu
        ? { key: 'gpu', status: 'ok', blocking: false, code: null, detail: null }
        : {
            key: 'gpu',
            status: 'warning',
            blocking: false,
            code: SETUP_CHECK_CODES.GPU_NOT_DETECTED,
            detail: null,
          },
    ]
  }

  private async storageCheck(): Promise<SetupCheckDto> {
    try {
      await this.deps.storage.put(STORAGE_CHECK_KEY, Buffer.from('ok'), {
        contentType: 'text/plain',
      })
      await this.deps.storage.delete(STORAGE_CHECK_KEY)
      return { key: 'storage', status: 'ok', blocking: false, code: null, detail: null }
    } catch (error) {
      return {
        key: 'storage',
        status: 'failed',
        blocking: false,
        code: SETUP_CHECK_CODES.STORAGE_UNAVAILABLE,
        detail: errorText(error),
      }
    }
  }

  /** Email works with the environment's SMTP server or one saved in the install settings. */
  private async emailCheck(databaseOk: boolean): Promise<SetupCheckDto> {
    const configured =
      this.deps.config.mail.driver === 'smtp' ||
      (databaseOk && (await this.deps.install.isSmtpConfigured().catch(() => false)))
    return configured
      ? { key: 'email', status: 'ok', blocking: false, code: null, detail: null }
      : {
          key: 'email',
          status: 'warning',
          blocking: false,
          code: SETUP_CHECK_CODES.EMAIL_NOT_CONFIGURED,
          detail: null,
        }
  }
}
