// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  SESSION_APPS,
  THEMES,
  USER_DISABLED_REASONS,
  type Locale,
  type SessionApp,
  type Theme,
  type UserDisabledReason,
} from '@surefy/contracts'

import { enumCheck, lowercaseCheck } from '../checks.js'
import { id, timestamps } from '../columns.js'
import { selfPolicy } from '../policies.js'

// Identity tables (database/identity-and-auth.md). `users`, `sessions`, `accounts`,
// `verifications` and `two_factors` have the shape Better Auth 1.7 expects for this configuration
// (core/auth: email and password, OAuth, the two-factor plugin, the `disabledAt`,
// `disabledReason` and `app` additional fields); `auth.tables.test.ts` compares them with Better
// Auth's own schema. Better Auth runs with `generateId: 'uuid'`, so the database generates the ids
// (`uuidv7()` like every table). These tables are global: no organization, no RLS, reached only
// through Better Auth and the `auth` module on `db.global`.

const at = () => timestamp({ withTimezone: true })

/** One person, global across organizations. */
export const users = pgTable(
  'users',
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    /** Object key `users/{userId}/avatar`, never an external URL. */
    image: text(),
    twoFactorEnabled: boolean().notNull().default(false),
    disabledAt: at(),
    disabledReason: text().$type<UserDisabledReason>(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    lowercaseCheck('users_email_lower_check', t.email),
    enumCheck('users_disabled_reason_check', t.disabledReason, USER_DISABLED_REASONS),
    check('users_disabled_check', sql`${t.disabledReason} is null or ${t.disabledAt} is not null`),
  ],
)

/** A signed-in session; each app keeps its own host-only cookie (ADR 0006). */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    token: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: at().notNull(),
    ipAddress: text(),
    userAgent: text(),
    app: text().$type<SessionApp>().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('sessions_token_key').on(t.token),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
    enumCheck('sessions_app_check', t.app, SESSION_APPS),
  ],
)

/** One way a person signs in: a password (`credential`), an OAuth provider or an SSO provider. */
export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(), // encrypted by Better Auth (encryptOAuthTokens)
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: at(),
    refreshTokenExpiresAt: at(),
    scope: text(),
    password: text(), // hash written and checked by Better Auth only
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('accounts_provider_id_account_id_key').on(t.providerId, t.accountId),
    index('accounts_user_id_idx').on(t.userId),
  ],
)

/** Short-lived values for email verification, password reset and email change. */
export const verifications = pgTable(
  'verifications',
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: at().notNull(),
    ...timestamps(),
  },
  (t) => [
    index('verifications_identifier_idx').on(t.identifier),
    index('verifications_expires_at_idx').on(t.expiresAt),
  ],
)

/**
 * The authenticator (TOTP) secret and recovery codes, both encrypted by Better Auth. No
 * timestamps: Better Auth's table shape. `verified`, `failed_verification_count` and
 * `locked_until` are the two-factor plugin's enrolment and lockout fields.
 */
export const twoFactors = pgTable(
  'two_factors',
  {
    id: id(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: at(),
  },
  (t) => [index('two_factors_user_id_idx').on(t.userId)],
)

/**
 * Personal preferences that follow the person across organizations (RLS family `self`). The
 * foreign key `last_organization_id → organizations (set null)` joins in the migration of the task
 * that creates `organizations`.
 */
export const userPreferences = pgTable(
  'user_preferences',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    locale: text().$type<Locale>(),
    theme: text().$type<Theme>().notNull().default('system'),
    timezone: text(),
    lastOrganizationId: uuid(),
    ...timestamps(),
  },
  (t) => [
    index('user_preferences_last_organization_id_idx')
      .on(t.lastOrganizationId)
      .where(sql`${t.lastOrganizationId} is not null`),
    enumCheck('user_preferences_theme_check', t.theme, THEMES),
    selfPolicy('user_preferences', t.userId),
  ],
)
