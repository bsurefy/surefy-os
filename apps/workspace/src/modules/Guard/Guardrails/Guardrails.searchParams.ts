// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import {
  ANY,
  DEFAULT_GUARDRAIL_SORT,
  GUARDRAIL_SORTS,
  SCOPE_FILTERS,
  STATUS_FILTERS,
  TYPE_FILTERS,
} from './Guardrails.constants'

/**
 * `?q=&type=&scope=&status=&sort=&rule=`: the filters and the open rule survive a reload and can be
 * shared. `rule` is a guardrail id, or `new` for the sheet that adds one.
 */
export const guardrailsSearchParams = {
  q: parseAsString.withDefault(''),
  type: parseAsStringLiteral(TYPE_FILTERS).withDefault(ANY),
  scope: parseAsStringLiteral(SCOPE_FILTERS).withDefault(ANY),
  status: parseAsStringLiteral(STATUS_FILTERS).withDefault(ANY),
  sort: parseAsStringLiteral(GUARDRAIL_SORTS).withDefault(DEFAULT_GUARDRAIL_SORT),
  rule: parseAsString,
}

export const loadGuardrailsSearchParams = createLoader(guardrailsSearchParams)
