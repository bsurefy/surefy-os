// SPDX-License-Identifier: AGPL-3.0-only
// Server entry for each app's `src/proxy.ts`. It must stay free of client-only code (React hooks,
// stores, components): the proxy bundle cannot hold them.
export { createSessionProxy } from './createSessionProxy'
export type { SessionProxyOptions } from './createSessionProxy'
