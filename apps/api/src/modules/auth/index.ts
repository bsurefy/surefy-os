// SPDX-License-Identifier: AGPL-3.0-only
export {
  createAuthEmails,
  createAuthModule,
  createAuthUsers,
  type AuthModule,
} from './auth.module.js'
export { AUTH_DEFAULTS, COMMUNITY_INSTALL_CAPABILITIES } from './auth.constants.js'
export type { AuthService } from './auth.service.js'
export type { AuthUsersService } from './authUsers/authUsers.service.js'
export type {
  InstallAdminsReader,
  InstallCapabilitiesSource,
  MembershipsReader,
  OrganizationCreationPolicy,
  SignupStatus,
} from './auth.types.js'
