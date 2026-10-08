// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import {
  CONNECTION_KIND_FILTERS,
  CONNECTION_SCOPE_FILTERS,
  CONNECTION_SORTS,
  CONNECTION_STATUS_FILTERS,
} from './ConnectionsSettings.constants'

/** `?q=&app=&kind=&scope=&status=&sort=`: the filters survive a reload and can be shared. */
export const connectionsSearchParams = {
  q: parseAsString.withDefault(''),
  app: parseAsString,
  kind: parseAsStringLiteral(CONNECTION_KIND_FILTERS),
  scope: parseAsStringLiteral(CONNECTION_SCOPE_FILTERS),
  status: parseAsStringLiteral(CONNECTION_STATUS_FILTERS).withDefault('all'),
  sort: parseAsStringLiteral(CONNECTION_SORTS).withDefault('name'),
}

export const loadConnectionsSearchParams = createLoader(connectionsSearchParams)
