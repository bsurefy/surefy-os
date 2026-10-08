// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { API_KEY_SORTS, API_KEY_STATUS_FILTERS } from './ApiKeysSettings.constants'

/** `?q=&status=&sort=&key=`: the filters and the open key survive a reload and can be shared. */
export const apiKeysSearchParams = {
  q: parseAsString.withDefault(''),
  status: parseAsStringLiteral(API_KEY_STATUS_FILTERS).withDefault('active'),
  sort: parseAsStringLiteral(API_KEY_SORTS).withDefault('-createdAt'),
  key: parseAsString,
}

export const loadApiKeysSearchParams = createLoader(apiKeysSearchParams)
