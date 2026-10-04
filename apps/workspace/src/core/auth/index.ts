// SPDX-License-Identifier: AGPL-3.0-only
// The guards are server-only: client code imports `@/core/auth/authClient` and
// `@/core/auth/useSignOut` directly, never this entry.
export { authClient } from './authClient'
export { checkFeature, checkPageAccess, getCurrentOrg, getEffectiveAccess } from './guards'
export { getWorkspaceUpgradeLinks } from './upgradeLinks'
