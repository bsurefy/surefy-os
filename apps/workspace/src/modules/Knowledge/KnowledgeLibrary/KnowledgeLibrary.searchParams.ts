// SPDX-License-Identifier: AGPL-3.0-only
import { parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { BASE_FILTERS, BASE_SORTS, LIBRARY_VIEWS } from '../Knowledge.constants'

/** `?q=&filter=&sort=&view=&create=`: the list's filters and the open view survive a reload and can be shared. */
export const knowledgeLibrarySearchParams = {
  q: parseAsString.withDefault(''),
  filter: parseAsStringLiteral(BASE_FILTERS).withDefault('all'),
  sort: parseAsStringLiteral(BASE_SORTS).withDefault('name'),
  view: parseAsStringLiteral(LIBRARY_VIEWS).withDefault('bases'),
  /** `?create=1` opens New knowledge base (the command palette's "New knowledge base"). */
  create: parseAsStringLiteral(['1'] as const),
}
