// SPDX-License-Identifier: AGPL-3.0-only
import { parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { SOURCE_SORTS, SOURCE_STATUS_FILTERS } from './SourcesTab.constants'

/** `?q=&status=&sort=&source=`: the Sources table's filters and the open source preview survive a reload. */
export const sourcesSearchParams = {
  q: parseAsString.withDefault(''),
  status: parseAsStringLiteral(SOURCE_STATUS_FILTERS).withDefault('all'),
  sort: parseAsStringLiteral(SOURCE_SORTS).withDefault('-createdAt'),
  source: parseAsString,
}
