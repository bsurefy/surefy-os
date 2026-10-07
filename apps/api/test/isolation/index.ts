// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tenant-isolation helpers (testing.md, §4). The suite generated from the route table
 * (`tenantIsolation.test.ts`, classified in `routeCoverage.ts`) runs `crossTenantCases` on every
 * org-scoped route; module route tests use `assertRouteIsolation`; repository tests use
 * `expectNoRowsOfOtherTenant`; the RLS suite uses `assertTenantIsolation` per tenant table.
 */
export {
  assertRouteIsolation,
  checkCrossTenantCase,
  crossTenantCases,
  fillPath,
  type CrossTenantCase,
  type CrossTenantSubjects,
  type OrgScopedRoute,
} from './crossTenant.js'
export { assertNoFindings, IsolationError } from './errors.js'
export { expectNoLeaks, findLeaks, type LeakMarkers } from './leaks.js'
export {
  assertTenantIsolation,
  collectTenantLeaks,
  expectNoRowsOfOtherTenant,
  failedQueryState,
  RLS_VIOLATION,
  type TenantProbe,
  type TwoOrgs,
} from './rls.js'
