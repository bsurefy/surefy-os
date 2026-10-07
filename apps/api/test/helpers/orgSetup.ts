// SPDX-License-Identifier: AGPL-3.0-only
import { authHeaders, type AuthHeaders } from './auth.js'
import { createTestApp, type TestApp, type TestAppOptions } from './testApp.js'
import { seedOrg, type SeededOrg, type TestMember } from '../factories/index.js'

import type { CrossTenantSubjects } from '../isolation/index.js'

/**
 * Two organizations for route tests: A with an Owner (olivia), an Admin (adam) and a User (uma),
 * B with its Owner (bea), everyone signed in. Tables are truncated between tests, so each test
 * calls it again.
 */
export interface TwoOrgSetup extends TestApp {
  a: SeededOrg<'olivia' | 'adam' | 'uma'>
  b: SeededOrg<'bea'>
  /** The session cookie of a seeded member. */
  sessionOf: (member: TestMember) => AuthHeaders
  /** B's Owner against A's resources, for `assertRouteIsolation`. */
  subjects: (params: Record<string, string>, markers: readonly string[]) => CrossTenantSubjects
}

export async function setupTwoOrgs(options: TestAppOptions = {}): Promise<TwoOrgSetup> {
  const testApp = await createTestApp(options)
  const { app, container } = testApp
  const a = await seedOrg(container, {
    name: 'Acme Research',
    members: { olivia: 'owner', adam: 'admin', uma: 'user' },
  })
  const b = await seedOrg(container, { name: 'Beta Works', members: { bea: 'owner' } })
  const sessions = new Map<string, AuthHeaders>()
  for (const member of [...Object.values(a.members), ...Object.values(b.members)]) {
    sessions.set(member.id, await authHeaders(app, member))
  }
  const sessionOf = (member: TestMember): AuthHeaders => {
    const headers = sessions.get(member.id)
    if (headers === undefined) throw new Error('unknown test member')
    return headers
  }
  return {
    ...testApp,
    a,
    b,
    sessionOf,
    subjects: (params, markers) => ({
      orgA: { id: a.id, params, markers: [...markers] },
      orgB: { id: b.id, session: sessionOf(b.members.bea) },
    }),
  }
}
