// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

/** A fresh id for a row the test creates itself (organization ids are generated in the app too). */
export const newId = (): string => randomUUID()

/** A `.test` address: never deliverable, unique per sequence number. */
export const testEmail = (seq: number, label = 'person'): string => `${label}-${seq}@example.test`

/** A URL-safe slug, unique per sequence number. */
export const testSlug = (seq: number, label = 'org'): string => `${label}-${seq}`

/** Satisfies every password policy the auth module may set; recorded nowhere else. */
export const testPassword = (seq: number): string => `Test-password-${seq}!`

/** A plain API key token in the shape the auth module hashes (`sk_` prefix). */
export const testApiKeyToken = (seq: number): string =>
  `sk_test_${seq.toString().padStart(4, '0')}_${randomUUID().replaceAll('-', '')}`
