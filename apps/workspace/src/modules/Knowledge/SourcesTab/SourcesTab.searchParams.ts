// SPDX-License-Identifier: AGPL-3.0-only
import { parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { KNOWLEDGE_CONNECTOR_PROVIDERS } from '@surefy/contracts'

import { SOURCE_SORTS, SOURCE_STATUS_FILTERS } from './SourcesTab.constants'

/**
 * `?q=&status=&sort=&source=&connect=`: the Sources table's filters, the open source preview and
 * the open connector dialog survive a reload. `connect` is also where an account sign-in started
 * from the connector dialog comes back to.
 */
export const sourcesSearchParams = {
  q: parseAsString.withDefault(''),
  status: parseAsStringLiteral(SOURCE_STATUS_FILTERS).withDefault('all'),
  sort: parseAsStringLiteral(SOURCE_SORTS).withDefault('-createdAt'),
  source: parseAsString,
  connect: parseAsStringLiteral(KNOWLEDGE_CONNECTOR_PROVIDERS),
}
