// SPDX-License-Identifier: AGPL-3.0-only
import { validEnv } from '@/core/config/__tests__/env.fixture.js'

import type { FastifyInstance } from 'fastify'

/**
 * Who a request acts as. Users come from the factories with test credentials, never from real
 * accounts; API keys carry the plain token the factory generated (the database holds its hash).
 */
export type TestActor =
  { kind: 'user'; id: string; email: string; password: string } | { kind: 'apiKey'; token: string }

export type AuthHeaders = Record<string, string>

/** The workspace origin of the test environment: Better Auth trusts it for sign-in. */
export const TEST_APP_ORIGIN = validEnv.APP_ORIGIN

/** The session cookie Better Auth sets (`cookiePrefix: 'surefy'`, not secure outside production). */
export const SESSION_COOKIE = 'surefy.session_token'

/**
 * Headers that authenticate `actor` (testing.md, §3). API keys go in `Authorization: Bearer`
 * (authentication.md); users sign in through Better Auth with `app.inject`.
 */
export function authHeaders(app: FastifyInstance, actor: TestActor): Promise<AuthHeaders> {
  if (actor.kind === 'apiKey') return Promise.resolve({ authorization: `Bearer ${actor.token}` })
  return signIn(app, actor)
}

/** The `name=value` pairs of a response's `Set-Cookie` headers. */
export function cookiesOf(setCookie: string | string[] | undefined): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const line of setCookie === undefined ? [] : [setCookie].flat()) {
    const [pair = ''] = line.split(';')
    const index = pair.indexOf('=')
    if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1))
  }
  return cookies
}

/**
 * Signs in with email and password and returns the session cookie only, without Better Auth's
 * signed cookie cache: every request then checks the session store, so a revoked session fails at
 * once instead of up to a minute later.
 */
async function signIn(
  app: FastifyInstance,
  actor: Extract<TestActor, { kind: 'user' }>,
): Promise<AuthHeaders> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { host: new URL(TEST_APP_ORIGIN).host, origin: TEST_APP_ORIGIN },
    payload: { email: actor.email, password: actor.password },
  })
  const token = cookiesOf(response.headers['set-cookie']).get(SESSION_COOKIE)
  if (response.statusCode !== 200 || token === undefined) {
    throw new Error(
      `authHeaders: sign-in failed for ${actor.email}: ${response.statusCode} ${response.body}`,
    )
  }
  return { cookie: `${SESSION_COOKIE}=${token}` }
}
