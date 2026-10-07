// SPDX-License-Identifier: AGPL-3.0-only
import type { SetupCheckDto } from '@surefy/contracts'

const SLUG_MAX_LENGTH = 48
const TRAILING_HYPHEN = /-$/
const EMAIL_SEPARATOR = /[\s,;]+/

/** A URL address proposed from the organization's name: "Acme Logistics!" becomes "acme-logistics". */
export function slugFromName(name: string): string {
  const letters = name
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .toLowerCase()
  let slug = ''
  for (const char of letters) {
    const isAllowed = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')
    if (isAllowed) slug += char
    else if (slug !== '' && !slug.endsWith('-')) slug += '-'
  }
  return slug.slice(0, SLUG_MAX_LENGTH).replace(TRAILING_HYPHEN, '')
}

/** A failed blocking check (the database) stops setup; warnings and optional failures continue. */
export function hasBlockingFailure(checks: readonly SetupCheckDto[]): boolean {
  return checks.some((check) => check.blocking && check.status === 'failed')
}

/** Whether invitations can be emailed; `true` when the check did not run (setup resumed). */
export function isEmailAvailable(checks: readonly SetupCheckDto[]): boolean {
  const email = checks.find((check) => check.key === 'email')
  return email === undefined || email.status === 'ok'
}

/** The addresses in a pasted list: split on newlines, commas and spaces, trimmed, once each. */
export function parseEmails(text: string): string[] {
  const seen = new Set<string>()
  for (const part of text.split(EMAIL_SEPARATOR)) {
    const email = part.trim().toLowerCase()
    if (email) seen.add(email)
  }
  return [...seen]
}
