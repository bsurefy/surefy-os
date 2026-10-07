// SPDX-License-Identifier: AGPL-3.0-only
import { organizationMembers, organizations, vaultSettings } from '@/database/tables/index.js'
import type { OrgRole } from '@surefy/contracts'

import { defineTableFactory } from './defineFactory.js'
import { createTestUser, type TestUser, type TestUserOptions } from './user.factory.js'
import { newId, testSlug } from './values.js'

import type { Container } from '@/container.js'

export const organizationFactory = defineTableFactory(organizations, (seq) => ({
  id: newId(),
  name: `Organization ${seq}`,
  slug: testSlug(seq),
}))

export const membershipFactory = defineTableFactory(organizationMembers, () => ({
  organizationId: newId(),
  userId: newId(),
  role: 'user' as const,
  provisioningSource: 'invitation' as const,
}))

/** A real person (signs in with `authHeaders`) with an active membership. */
export type TestMember = TestUser & { memberId: string; role: OrgRole }

export interface SeedOrgOptions<Name extends string> {
  /** The people to create, by test name, with their role: `{ maya: 'owner', omar: 'user' }`. */
  members: Record<Name, OrgRole>
  name?: string
  slug?: string
}

export interface SeededOrg<Name extends string> {
  id: string
  name: string
  slug: string
  members: Record<Name, TestMember>
}

type SeedContainer = Pick<Container, 'auth' | 'db'>

/**
 * An organization with members (testing.md, §1): the organization row and one membership per
 * person, written as fixtures under `db.tenant`, without the organization limit or the creation
 * policy (those have their own tests). The people are real accounts created through Better Auth.
 */
export async function seedOrg<Name extends string>(
  container: SeedContainer,
  options: SeedOrgOptions<Name>,
): Promise<SeededOrg<Name>> {
  const orgId = newId()
  const org = await container.db.tenant(orgId, async (tx) => {
    const created = await organizationFactory.create(tx, {
      id: orgId,
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.slug === undefined ? {} : { slug: options.slug }),
    })
    // every organization has its vault settings row (its data key is made on first use)
    await tx.insert(vaultSettings).values({ organizationId: orgId })
    return created
  })
  const members = {} as Record<Name, TestMember>
  for (const [name, role] of Object.entries(options.members) as [Name, OrgRole][]) {
    members[name] = await addMember(container, orgId, role, { name })
  }
  return { id: org.id, name: org.name, slug: org.slug, members }
}

/** One more person with an active membership in an existing organization. */
export async function addMember(
  container: SeedContainer,
  orgId: string,
  role: OrgRole,
  userOptions: TestUserOptions = {},
): Promise<TestMember> {
  const user = await createTestUser(container, userOptions)
  const membership = await container.db.tenant(orgId, (tx) =>
    membershipFactory.create(tx, { organizationId: orgId, userId: user.id, role }),
  )
  return { ...user, memberId: membership.id, role }
}
