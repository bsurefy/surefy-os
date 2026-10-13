// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString } from 'nuqs/server'

/** `?q=`: the search of the personal limits survives a reload and can be shared. */
export const usageBudgetsSearchParams = {
  q: parseAsString.withDefault(''),
}

export const loadUsageBudgetsSearchParams = createLoader(usageBudgetsSearchParams)
