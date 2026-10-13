// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsStringLiteral } from 'nuqs/server'

import { DEFAULT_GUARD_RANGE, GUARD_RANGES } from './GuardOverview.constants'

/** `?range=`: the period survives a reload and can be shared. */
export const guardOverviewSearchParams = {
  range: parseAsStringLiteral(GUARD_RANGES).withDefault(DEFAULT_GUARD_RANGE),
}

export const loadGuardOverviewSearchParams = createLoader(guardOverviewSearchParams)
