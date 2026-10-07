// SPDX-License-Identifier: AGPL-3.0-only
import { betterAuth, type BetterAuthPlugin } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { twoFactor } from 'better-auth/plugins'

import { accounts, sessions, twoFactors, users, verifications } from '@/database/tables/index.js'
import { SESSION_COOKIE_PREFIX } from '@surefy/contracts'

import { appOfUrl, authAllowedHosts } from './origins.js'
import { redisSecondaryStorage } from './secondaryStorage.js'

import type { CacheClient } from '@/core/cache/index.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

/** Better Auth handles every route under this path (authentication.md, §3). */
export const AUTH_BASE_PATH = '/api/auth'

/** Session lifetimes (authentication.md, §2): seconds. */
export const SESSION_TTL = {
  expiresIn: 60 * 60 * 24 * 7,
  updateAge: 60 * 60 * 24,
  /** "Fresh session" for sensitive actions: signed in within the last 10 minutes. */
  freshAge: 60 * 10,
  /** The signed cookie cache trusts a session this long without a lookup. */
  cookieCacheMaxAge: 60,
} as const

/** Reset links live one hour, verification links one day (identity-and-auth.md, §4). */
const RESET_LINK_TTL = 60 * 60
const VERIFICATION_LINK_TTL = 60 * 60 * 24

/** Who a Better Auth email goes to and the link it carries. */
export interface AuthEmailInput {
  userId: string
  email: string
  url: string
}

/** The emails Better Auth asks for; the auth module queues them on the `email` queue. */
export interface AuthEmails {
  verifyEmail(input: AuthEmailInput): Promise<void>
  passwordReset(input: AuthEmailInput): Promise<void>
}

/**
 * Whether a person may create an account through the public sign-up and OAuth endpoints. The
 * install's sign-up policy and pending invitations decide (install and members modules). Accounts
 * created by trusted server code (first-run setup, accepting an invitation) do not ask.
 */
export interface SignupPolicy {
  allows(input: { email: string }): Promise<boolean>
}

/** What the session create hook needs to know about a person. */
export interface AuthUserStatus {
  isDisabled(userId: string): Promise<boolean>
}

export interface AuthDeps {
  config: Config
  db: Database
  redis: CacheClient
  logger: Logger
  emails: AuthEmails
  signup: SignupPolicy
  users: AuthUserStatus
  /** Contributed by extensions (`addAuthPlugins`): SSO, SCIM. */
  plugins: readonly BetterAuthPlugin[]
}

/** Better Auth's error for a closed sign-up; the sign-up screens show "Ask your admin". */
export const SIGNUP_CLOSED = 'SIGNUP_CLOSED'

const socialProviders = (oauth: Config['auth']['oauth']) => ({
  ...(oauth.google === undefined ? {} : { google: { ...oauth.google } }),
  ...(oauth.microsoft === undefined ? {} : { microsoft: { ...oauth.microsoft } }),
  ...(oauth.github === undefined ? {} : { github: { ...oauth.github } }),
})

/**
 * Better Auth for identity (authentication.md, §2): email and password with verification, OAuth
 * providers configured in the environment, two-factor login and database sessions cached in
 * Redis. Created in the composition root after the extensions, so their plugins are included.
 */
export function createAuth(deps: AuthDeps) {
  const { config, logger } = deps
  return betterAuth({
    appName: config.app.name,
    // Links and callbacks use the host of the app the request came through (session plugin).
    baseURL: {
      allowedHosts: authAllowedHosts(config),
      protocol: 'auto',
      fallback: config.api.publicUrl,
    },
    basePath: AUTH_BASE_PATH,
    secret: config.auth.secret,
    trustedOrigins: [...config.web.origins],
    telemetry: { enabled: false },
    logger: {
      log: (level, message, ...args) => {
        logger[level]({ component: 'better-auth', args }, message)
      },
    },
    database: drizzleAdapter(deps.db.global, {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications, twoFactors },
    }),
    advanced: {
      // The database generates ids with uuidv7() (database.md, §9: the documented fallback).
      database: { generateId: 'uuid' },
      useSecureCookies: config.app.isProduction,
      cookiePrefix: SESSION_COOKIE_PREFIX,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: RESET_LINK_TTL,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await deps.emails.passwordReset({ userId: user.id, email: user.email, url })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_LINK_TTL,
      sendVerificationEmail: async ({ user, url }) => {
        await deps.emails.verifyEmail({ userId: user.id, email: user.email, url })
      },
    },
    socialProviders: socialProviders(config.auth.oauth),
    account: { encryptOAuthTokens: true },
    user: {
      changeEmail: { enabled: true }, // the new address gets a verification link
      additionalFields: {
        disabledAt: { type: 'date', required: false, input: false },
        disabledReason: { type: 'string', required: false, input: false },
      },
    },
    session: {
      expiresIn: SESSION_TTL.expiresIn,
      updateAge: SESSION_TTL.updateAge,
      freshAge: SESSION_TTL.freshAge,
      cookieCache: { enabled: true, maxAge: SESSION_TTL.cookieCacheMaxAge },
      storeSessionInDatabase: true, // sessions survive a Redis flush and can be listed and revoked
      additionalFields: {
        app: { type: 'string', required: true, input: false, defaultValue: 'workspace' },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            // Only public sign-up asks the policy; server code that creates accounts has no request.
            if (context?.request !== undefined) {
              const allowed = await deps.signup.allows({ email: user.email.toLowerCase() })
              if (!allowed) {
                throw new APIError('FORBIDDEN', {
                  code: SIGNUP_CLOSED,
                  message: 'Sign-up is closed',
                })
              }
            }
            return { data: { ...user, email: user.email.toLowerCase() } }
          },
        },
      },
      session: {
        create: {
          before: async (session, context) => {
            if (await deps.users.isDisabled(session.userId)) return false // no session when disabled
            const app = appOfUrl(config, context?.request?.url)
            return { data: { ...session, app } }
          },
        },
      },
    },
    // Counters live in Redis; tests sign in many times from one address, so they run without.
    rateLimit: { enabled: config.app.env !== 'test', storage: 'secondary-storage' },
    secondaryStorage: redisSecondaryStorage(deps.redis),
    plugins: [twoFactor({ issuer: config.app.name }), ...deps.plugins],
  })
}
export type Auth = ReturnType<typeof createAuth>
