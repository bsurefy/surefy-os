// SPDX-License-Identifier: AGPL-3.0-only
// Browser-safe entry. `getSession` and `requireSession` live behind `@surefy/web-core/auth/server`;
// `createSessionProxy` behind `@surefy/web-core/auth/proxy`.
export { getSafeRedirect, REDIRECT_PARAM } from './redirects'
export { SessionExpiredDialog } from './SessionExpiredDialog'
export type {
  SessionExpiredDialogProps,
  SessionSignInSlotProps,
} from './SessionExpiredDialog.types'
export { closeSessionExpired, openSessionExpired, useIsSessionExpired } from './sessionExpiredStore'
