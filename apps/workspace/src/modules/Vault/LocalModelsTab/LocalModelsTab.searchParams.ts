// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

/** `?q=&add=server`: the models search and the Add local server dialog survive a reload and can be shared. */
export const localModelsSearchParams = {
  q: parseAsString.withDefault(''),
  add: parseAsStringLiteral(['server'] as const),
}

export const loadLocalModelsSearchParams = createLoader(localModelsSearchParams)
