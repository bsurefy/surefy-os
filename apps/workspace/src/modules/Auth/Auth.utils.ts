// SPDX-License-Identifier: AGPL-3.0-only
import { ROUTES } from '@/constants/routes'
import type { MeDto } from '@surefy/contracts'

import {
  AUTH_ERROR_KEYS,
  PASSWORD_STRENGTH_LEVELS,
  PENDING_EMAIL_STORAGE_KEY,
} from './Auth.constants'

import type { AuthErrorKey } from './Auth.constants'

/** The error shape of the Better Auth client. */
export interface AuthClientError {
  code?: string
  message?: string
  status: number
}

/**
 * Where a signed-in person lands when no page was asked for: no organization, the last-used one,
 * the only one, or the picker.
 */
export function getPostSignInPath(me: Pick<MeDto, 'memberships' | 'preferences'>): string {
  const { memberships, preferences } = me
  if (memberships.length === 0) return ROUTES.auth.noOrganization
  const lastUsed = memberships.find(
    (membership) => membership.organization.id === preferences.lastOrganizationId,
  )
  const target = lastUsed ?? (memberships.length === 1 ? memberships[0] : undefined)
  return target ? ROUTES.workspace.home(target.organization.slug) : ROUTES.auth.organizations
}

/** The `auth.errors` key for a Better Auth error. */
export function getAuthErrorKey(
  error: Pick<AuthClientError, 'code' | 'status'>,
): AuthErrorKey | 'rateLimited' | 'generic' {
  if (error.status === 429) return 'rateLimited'
  const code = error.code
  if (code !== undefined && code in AUTH_ERROR_KEYS) {
    return AUTH_ERROR_KEYS[code as keyof typeof AUTH_ERROR_KEYS]
  }
  return 'generic'
}

/**
 * When a rate-limited request may be repeated, from the `X-Retry-After` header (seconds); a
 * missing or invalid header falls back to one minute.
 */
export function getRetryAt(retryAfterHeader: string | null, now: Date = new Date()): Date {
  const seconds = Number(retryAfterHeader)
  const delay = Number.isFinite(seconds) && seconds > 0 ? seconds : 60
  return new Date(now.getTime() + delay * 1000)
}

/** 0 (nothing typed) to 4: length, mixed case, digits and symbols each add a level. */
export function getPasswordStrength(password: string): number {
  if (password.length === 0) return 0
  let score = password.length >= 12 ? 1 : 0
  if (password.length >= 16) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1
  return Math.min(score, PASSWORD_STRENGTH_LEVELS)
}

/** Remembers the address of a sign-up in progress for the "Check your email" screen. */
export function savePendingEmail(email: string): void {
  try {
    sessionStorage.setItem(PENDING_EMAIL_STORAGE_KEY, email)
  } catch {
    // storage blocked: the screen asks for the address again
  }
}

export function readPendingEmail(): string | null {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_STORAGE_KEY)
  } catch {
    return null
  }
}

export function clearPendingEmail(): void {
  try {
    sessionStorage.removeItem(PENDING_EMAIL_STORAGE_KEY)
  } catch {
    // nothing to clear
  }
}

/** The secret inside an `otpauth://` URI, for authenticator apps that cannot scan. */
export function getTotpSecret(totpUri: string): string {
  try {
    return new URL(totpUri).searchParams.get('secret') ?? ''
  } catch {
    return ''
  }
}
