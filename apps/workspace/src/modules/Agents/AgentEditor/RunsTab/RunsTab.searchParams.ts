// SPDX-License-Identifier: AGPL-3.0-only
import { parseAsBoolean, parseAsString, parseAsStringLiteral } from 'nuqs'

import { STATUS_FILTERS } from './RunsTab.constants'

/** `?q=&status=&human=&test=`: the runs' filters survive a reload and can be shared. */
export const runsTabSearchParams = {
  q: parseAsString.withDefault(''),
  status: parseAsStringLiteral(STATUS_FILTERS),
  human: parseAsBoolean.withDefault(false),
  test: parseAsBoolean.withDefault(false),
}
