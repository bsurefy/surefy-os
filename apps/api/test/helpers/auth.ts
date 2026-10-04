// SPDX-License-Identifier: AGPL-3.0-only
import type { FastifyInstance } from 'fastify'

/**
 * Who a request acts as. Users come from the factories with test credentials, never from real
 * accounts; API keys carry the plain token the factory generated (the database holds its hash).
 */
export type TestActor =
  { kind: 'user'; id: string; email: string; password: string } | { kind: 'apiKey'; token: string }

export type AuthHeaders = Record<string, string>

/**
 * Headers that authenticate `actor` (testing.md, §3). API keys go in `Authorization: Bearer`
 * (authentication.md). Session sign-in is the extension point the auth module task fills in:
 * post the credentials to Better Auth through `app.inject` and return the session cookie.
 */
export function authHeaders(app: FastifyInstance, actor: TestActor): Promise<AuthHeaders> {
  if (actor.kind === 'apiKey') return Promise.resolve({ authorization: `Bearer ${actor.token}` })
  return signIn(app, actor)
}

/** Replaced by the auth module task; until then no route needs a session. */
const signIn = (_app: FastifyInstance, actor: Extract<TestActor, { kind: 'user' }>) =>
  Promise.reject(
    new Error(`authHeaders: no session sign-in yet (auth module pending) for ${actor.email}`),
  )
