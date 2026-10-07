// SPDX-License-Identifier: AGPL-3.0-only

/** Seconds before "Resend" works again on the verification and reset screens. */
export const RESEND_COOLDOWN_SECONDS = 60

/** Where the address of a sign-up in progress waits for the "Check your email" screen. */
export const PENDING_EMAIL_STORAGE_KEY = 'surefy.auth.pendingEmail'

/** Digits of an authenticator code. */
export const TWO_FACTOR_CODE_LENGTH = 6

/**
 * Better Auth's error codes the screens explain; anything else shows the generic message. The
 * value is a key of `auth.errors`.
 */
// The keys are Better Auth error codes, not secrets.
/* eslint-disable sonarjs/no-hardcoded-passwords */
export const AUTH_ERROR_KEYS = {
  INVALID_EMAIL_OR_PASSWORD: 'invalidCredentials',
  EMAIL_NOT_VERIFIED: 'emailNotVerified',
  USER_ALREADY_EXISTS: 'alreadyRegistered',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'alreadyRegistered',
  SIGNUP_CLOSED: 'signupClosed',
  INVALID_TOKEN: 'invalidToken',
  // an error code, not a secret

  INVALID_PASSWORD: 'invalidPassword',
  PASSWORD_TOO_SHORT: 'passwordTooShort',
  PASSWORD_TOO_LONG: 'passwordTooLong',
  INVALID_CODE: 'invalidCode',
  INVALID_BACKUP_CODE: 'invalidRecoveryCode',
  INVALID_TWO_FACTOR_COOKIE: 'twoFactorExpired',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'twoFactorExpired',
  TOTP_NOT_ENABLED: 'twoFactorNotEnabled',
  ACCOUNT_DISABLED: 'accountDisabled',
} as const
/* eslint-enable sonarjs/no-hardcoded-passwords */
export type AuthErrorKey = (typeof AUTH_ERROR_KEYS)[keyof typeof AUTH_ERROR_KEYS]

/** The Better Auth code of an unverified email, which sends the person to the verify screen. */
export const EMAIL_NOT_VERIFIED_CODE = 'EMAIL_NOT_VERIFIED'
/** The Better Auth code of a reset link that is expired, used or unknown. */
export const INVALID_TOKEN_CODE = 'INVALID_TOKEN'
/** The Better Auth code of a two-factor sign-in that timed out. */
export const TWO_FACTOR_COOKIE_CODE = 'INVALID_TWO_FACTOR_COOKIE'

export const PASSWORD_STRENGTH_LEVELS = 4

/** Hosts a sign-in with a provider comes back from; the provider ids of the contract. */
export const OAUTH_PROVIDER_LABEL_KEYS = {
  google: 'google',
  microsoft: 'microsoft',
  github: 'github',
} as const
