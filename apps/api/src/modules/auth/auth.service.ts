// SPDX-License-Identifier: AGPL-3.0-only
import { UnauthorizedError } from '@/core/errors/index.js'
import { OAUTH_PROVIDERS } from '@surefy/contracts'
import type {
  MeDto,
  RevokeOtherSessionsResultDto,
  SessionDto,
  SignInOptionsDto,
  UpdateMeInput,
} from '@surefy/contracts'

import { MAX_LISTED_SESSIONS } from './auth.constants.js'
import {
  LastOrganizationNotFoundError,
  SessionNotFoundError,
  SessionRequiredError,
} from './auth.errors.js'
import { toSessionDto, toUserDto, toUserPreferencesDto } from './auth.mapper.js'

import type { AuthRepository, UserPreferencesPatch } from './auth.repository.js'
import type {
  InstallAdminsReader,
  InstallCapabilitiesSource,
  MembershipsReader,
  OrganizationCreationPolicy,
  SignupStatus,
} from './auth.types.js'
import type { AuthUsersService } from './authUsers/authUsers.service.js'
import type { Auth } from '@/core/auth/index.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { ActorContext, ActorSession } from '@/types/context.js'

export interface AuthServiceDeps {
  config: Config
  db: Database
  auth: Auth
  authRepository: AuthRepository
  users: AuthUsersService
  memberships: MembershipsReader
  installAdmins: InstallAdminsReader
  organizationCreation: OrganizationCreationPolicy
  installCapabilities: InstallCapabilitiesSource
  signup: SignupStatus
  version: string
}

interface SignedInActor {
  userId: string
  session: ActorSession
}

/** `/me` endpoints run for a person with a session; `app.authenticate()` guarantees it. */
const signedIn = (ctx: ActorContext | null): SignedInActor => {
  if (ctx === null) throw new UnauthorizedError()
  if (ctx.userId === null || ctx.session === undefined) throw new SessionRequiredError()
  return { userId: ctx.userId, session: ctx.session }
}

/**
 * The endpoints SurefyOS adds on top of Better Auth (authentication.md, §4): the signed-in person,
 * their profile and preferences, and their sessions. Sign-up, sign-in, verification, password reset
 * and two-factor stay Better Auth's, under `/api/auth/*`.
 */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async me(ctx: ActorContext | null): Promise<MeDto> {
    const { userId, session } = signedIn(ctx)
    const user = await this.deps.users.findById(userId)
    if (user === undefined) throw new UnauthorizedError() // deleted while the session lived
    const [memberships, preferences, isInstallAdmin, canCreateOrganization, imageUrl] =
      await Promise.all([
        this.deps.memberships.listActiveMemberships(userId),
        this.deps.db.user(userId, (tx) => this.deps.authRepository.findPreferences(tx, userId)),
        this.deps.installAdmins.isInstallAdmin(userId),
        this.deps.organizationCreation.canCreateOrganization(userId),
        this.deps.users.imageUrl(user.image),
      ])
    const activeOrganizationIds = new Set(memberships.map((m) => m.organization.id))
    return {
      user: toUserDto(user, imageUrl),
      preferences: toUserPreferencesDto(preferences, activeOrganizationIds),
      session: {
        id: session.id,
        app: session.app,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      },
      memberships,
      // Platform and partner roles and access grants are Cloud's (cloud-api); none on this install.
      platform: null,
      partners: [],
      supportAccess: [],
      isInstallAdmin,
      install: this.deps.installCapabilities.getInstallCapabilities(),
      canCreateOrganization,
    }
  }

  async updateMe(ctx: ActorContext | null, input: UpdateMeInput): Promise<MeDto> {
    const { userId } = signedIn(ctx)
    const { name } = input
    const patch = preferencesPatch(input)
    if (patch.lastOrganizationId != null) {
      const memberships = await this.deps.memberships.listActiveMemberships(userId)
      const isMember = memberships.some((m) => m.organization.id === patch.lastOrganizationId)
      if (!isMember) throw new LastOrganizationNotFoundError()
    }
    if (Object.keys(patch).length > 0) {
      await this.deps.db.user(userId, (tx) =>
        this.deps.authRepository.upsertPreferences(tx, userId, patch),
      )
    }
    if (name !== undefined) await this.deps.users.updateName(userId, name)
    return this.me(ctx)
  }

  async listSessions(ctx: ActorContext | null): Promise<SessionDto[]> {
    const { userId, session } = signedIn(ctx)
    const rows = await this.deps.authRepository.listActiveSessions(
      this.deps.db.global,
      userId,
      MAX_LISTED_SESSIONS,
    )
    return rows.map((row) => toSessionDto(row, session.id))
  }

  /** Ends one of the person's sessions, the current one included (that signs this device out). */
  async revokeSession(ctx: ActorContext | null, sessionId: string): Promise<void> {
    const { userId } = signedIn(ctx)
    const row = await this.deps.authRepository.findSession(this.deps.db.global, userId, sessionId)
    if (row === undefined) throw new SessionNotFoundError()
    await this.revokeTokens([row.token])
  }

  /** "Sign out everywhere else": every other session of the person ends. */
  async revokeOtherSessions(ctx: ActorContext | null): Promise<RevokeOtherSessionsResultDto> {
    const { userId, session } = signedIn(ctx)
    const rows = await this.deps.authRepository.listOtherSessionTokens(
      this.deps.db.global,
      userId,
      session.id,
    )
    await this.revokeTokens(rows.map((row) => row.token))
    return { revoked: rows.length }
  }

  async signInOptions(): Promise<SignInOptionsDto> {
    const { oauth } = this.deps.config.auth
    return {
      emailPassword: true,
      oauthProviders: OAUTH_PROVIDERS.filter((provider) => oauth[provider] !== undefined),
      signupOpen: await this.deps.signup.isSignupOpen(),
      version: this.deps.version,
    }
  }

  /** Through Better Auth, so its Redis copy of each session goes too. */
  private async revokeTokens(tokens: readonly string[]): Promise<void> {
    if (tokens.length === 0) return
    const context = await this.deps.auth.$context
    await context.internalAdapter.deleteSessions([...tokens])
  }
}

/** Only the preference fields the request sets; `null` clears a value. */
const preferencesPatch = (input: UpdateMeInput): UserPreferencesPatch => ({
  ...(input.locale === undefined ? {} : { locale: input.locale }),
  ...(input.theme === undefined ? {} : { theme: input.theme }),
  ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
  ...(input.lastOrganizationId === undefined
    ? {}
    : { lastOrganizationId: input.lastOrganizationId }),
})
