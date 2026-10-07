// SPDX-License-Identifier: AGPL-3.0-only

import { APP_VERSION } from '@/lib/appVersion.js'

import { AUTH_DEFAULTS } from './auth.constants.js'
import { AuthController } from './auth.controller.js'
import { AuthRepository } from './auth.repository.js'
import { authRoutes } from './auth.routes.js'
import { AuthService } from './auth.service.js'
import { AuthUsersService } from './authUsers/authUsers.service.js'

import type {
  InstallAdminsReader,
  InstallCapabilitiesSource,
  MembershipsReader,
  OrganizationCreationPolicy,
  PendingInvitationsReader,
  SignupStatus,
} from './auth.types.js'
import type { Auth, AuthEmailInput, AuthEmails, SignupPolicy } from '@/core/auth/index.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'
import type { EmailTemplate, NotificationsService } from '@/modules/notifications/index.js'

export interface AuthUsersModuleDeps {
  db: Database
  storage: StorageProvider
}

/**
 * Identity reads (`findUserRefs`, `isDisabled`) for the modules created before Better Auth, such
 * as notifications, and for the session hook. Step 2 of the composition root builds it.
 */
export function createAuthUsers(deps: AuthUsersModuleDeps): AuthUsersService {
  return new AuthUsersService(deps)
}

export interface AuthEmailsDeps {
  db: Database
  notifications: Pick<NotificationsService, 'queueEmail'>
}

/** Better Auth's emails go on the `email` queue, in the person's language when they chose one. */
export function createAuthEmails(deps: AuthEmailsDeps): AuthEmails {
  const repository = new AuthRepository()
  const queue = async (
    template: Extract<EmailTemplate, 'verifyEmail' | 'passwordReset'>,
    input: AuthEmailInput,
  ) => {
    const preferences = await deps.db.user(input.userId, (tx) =>
      repository.findPreferences(tx, input.userId),
    )
    const locale = preferences?.locale ?? undefined
    await deps.notifications.queueEmail({
      template,
      to: input.email,
      url: input.url,
      ...(locale === undefined ? {} : { locale }),
    })
  }
  return {
    verifyEmail: (input) => queue('verifyEmail', input),
    passwordReset: (input) => queue('passwordReset', input),
  }
}

/**
 * The sign-up policy Better Auth asks: the install's policy, or a pending invitation for the
 * address (open sign-up stays closed for everyone else). `isSignupOpen` reports the install's.
 */
export function createSignupPolicy(
  install: SignupPolicy & SignupStatus,
  invitations: PendingInvitationsReader,
): SignupPolicy & SignupStatus {
  return {
    allows: async (input) =>
      (await install.allows(input)) || invitations.hasPendingInvitation(input.email),
    isSignupOpen: () => install.isSignupOpen(),
  }
}

export interface AuthModuleDeps {
  config: Config
  db: Database
  auth: Auth
  users: AuthUsersService
  memberships?: MembershipsReader
  installAdmins?: InstallAdminsReader
  organizationCreation?: OrganizationCreationPolicy
  /** The access module's entitlement source (ADR 0020). */
  installCapabilities: InstallCapabilitiesSource
  signup?: SignupStatus
}

export function createAuthModule(deps: AuthModuleDeps) {
  const service = new AuthService({
    config: deps.config,
    db: deps.db,
    auth: deps.auth,
    authRepository: new AuthRepository(),
    users: deps.users,
    memberships: deps.memberships ?? AUTH_DEFAULTS.memberships,
    installAdmins: deps.installAdmins ?? AUTH_DEFAULTS.installAdmins,
    organizationCreation: deps.organizationCreation ?? AUTH_DEFAULTS.organizationCreation,
    installCapabilities: deps.installCapabilities,
    signup: deps.signup ?? AUTH_DEFAULTS.signup,
    version: APP_VERSION,
  })
  return { service, users: deps.users, routes: authRoutes(new AuthController(service)) }
}
export type AuthModule = ReturnType<typeof createAuthModule>
