// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'

import { users } from '@/database/tables/index.js'

import { testEmail, testPassword } from './values.js'

import type { TestActor } from '../helpers/auth.js'
import type { Container } from '@/container.js'

export type TestUser = Extract<TestActor, { kind: 'user' }> & { name: string }

export interface TestUserOptions {
  name?: string
  email?: string
  password?: string
  /** Verified by default: Better Auth refuses sign-in before the email is verified. */
  emailVerified?: boolean
}

let seq = 0

/**
 * A person created through Better Auth (server side, as first-run setup and invitations do), with
 * test credentials only. Returns the actor `authHeaders` signs in with.
 */
export async function createTestUser(
  container: Pick<Container, 'auth' | 'db'>,
  options: TestUserOptions = {},
): Promise<TestUser> {
  seq += 1
  const name = options.name ?? `Person ${seq}`
  const email = options.email ?? testEmail(seq)
  const password = options.password ?? testPassword(seq)
  const { user } = await container.auth.api.signUpEmail({ body: { name, email, password } })
  if (options.emailVerified !== false) {
    await container.db.global
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, user.id))
  }
  return { kind: 'user', id: user.id, email: user.email, password, name }
}
