// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Fixtures (testing.md, §1). Module tasks add one file per domain next to this one
 * (`organization.factory.ts`, `user.factory.ts`, `team.factory.ts`…) built with
 * `defineTableFactory` and re-export them here. `seedOrg(container, { members })` creates an
 * organization with real, signed-in-able members.
 */
export {
  defineFactory,
  defineTableFactory,
  type Factory,
  type FactoryDefinition,
} from './defineFactory.js'
export {
  addMember,
  membershipFactory,
  organizationFactory,
  seedOrg,
  type SeededOrg,
  type SeedOrgOptions,
  type TestMember,
} from './organization.factory.js'
export { createTestUser, type TestUser, type TestUserOptions } from './user.factory.js'
export { newId, testApiKeyToken, testEmail, testPassword, testSlug } from './values.js'
