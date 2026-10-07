// SPDX-License-Identifier: AGPL-3.0-only
export {
  AUTH_BASE_PATH,
  createAuth,
  SESSION_TTL,
  SIGNUP_CLOSED,
  type Auth,
  type AuthDeps,
  type AuthEmailInput,
  type AuthEmails,
  type AuthUserStatus,
  type SignupPolicy,
} from './auth.js'
export { appOfUrl, authAllowedHosts, trustedOriginOf } from './origins.js'
