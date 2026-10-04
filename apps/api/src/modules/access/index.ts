// SPDX-License-Identifier: AGPL-3.0-only
export { createAccessModule, type AccessModule } from './access.module.js'
export { COMPARE_EDITIONS_URL } from './access.constants.js'
export {
  COMMUNITY_INSTALL_CAPABILITIES,
  CommunityEntitlements,
  createEntitlementSource,
} from './communityEntitlements.js'
export type { AccessService } from './access.service.js'
export type { AccessContext, AccessModels } from './access.types.js'
export type {
  AccessCheck,
  AccessCheckInput,
  EntitlementGrant,
  EntitlementSource,
} from './entitlements.types.js'
