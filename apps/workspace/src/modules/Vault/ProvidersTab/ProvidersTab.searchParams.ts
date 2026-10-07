// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { KEY_SCOPES_FILTER } from './ProvidersTab.constants'

/** `?q=&scope=&add=key`: the keys table's filters and the Add API key dialog survive a reload and can be shared. */
export const providersSearchParams = {
  q: parseAsString.withDefault(''),
  scope: parseAsStringLiteral(KEY_SCOPES_FILTER),
  add: parseAsStringLiteral(['key'] as const),
}

export const loadProvidersSearchParams = createLoader(providersSearchParams)
