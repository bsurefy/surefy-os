// SPDX-License-Identifier: AGPL-3.0-only
import { createHttpClient } from './createHttpClient'

/** Browser instance: the app's own origin, so the host-only session cookie travels with it. */
export const apiClient = createHttpClient({ getBaseUrl: () => window.location.origin })
