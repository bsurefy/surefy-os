// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Fixtures (testing.md, §1). Module tasks add one file per domain next to this one
 * (`organization.factory.ts`, `user.factory.ts`, `team.factory.ts`…) built with
 * `defineTableFactory`, plus `seedOrg(db, { roles })` once organizations, users and members
 * exist, and re-export them here.
 */
export {
  defineFactory,
  defineTableFactory,
  type Factory,
  type FactoryDefinition,
} from './defineFactory.js'
export { createTestUser, type TestUser, type TestUserOptions } from './user.factory.js'
export { newId, testApiKeyToken, testEmail, testPassword, testSlug } from './values.js'
