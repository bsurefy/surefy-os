// SPDX-License-Identifier: AGPL-3.0-only
import type { Locale } from '@surefy/contracts'

/** Emails fall back to the source locale when the recipient has none. */
export const SOURCE_LOCALE: Locale = 'en'

/** The `sendEmail` job of the `email` queue. */
export const SEND_EMAIL_JOB_NAME = 'sendEmail'
