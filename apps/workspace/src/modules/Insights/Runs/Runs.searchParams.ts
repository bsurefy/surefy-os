// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsBoolean, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { RUN_SORTS, RUNS_RANGES, STATUS_FILTERS, TRIGGER_FILTERS } from './Runs.constants'

/**
 * `?q=&status=&trigger=&agent=&team=&model=&human=&range=&from=&to=&sort=`: the run log's search,
 * filters and sort survive a reload and can be shared; the Overview links here with its range and
 * agent. `from` and `to` are calendar days (`2026-09-01`), used by `custom`.
 */
export const runsSearchParams = {
  q: parseAsString.withDefault(''),
  status: parseAsStringLiteral(STATUS_FILTERS),
  trigger: parseAsStringLiteral(TRIGGER_FILTERS),
  agent: parseAsString,
  team: parseAsString,
  model: parseAsString,
  human: parseAsBoolean.withDefault(false),
  range: parseAsStringLiteral(RUNS_RANGES).withDefault('any'),
  from: parseAsString,
  to: parseAsString,
  sort: parseAsStringLiteral(RUN_SORTS).withDefault('-startedAt'),
}

export const loadRunsSearchParams = createLoader(runsSearchParams)
