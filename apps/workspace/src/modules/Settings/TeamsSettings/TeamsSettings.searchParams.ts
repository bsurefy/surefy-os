// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { TEAM_SORTS } from './TeamsSettings.constants'

/** `?q=&sort=&team=`: the list's filters and the open team detail survive a reload and can be shared. */
export const teamsSearchParams = {
  q: parseAsString.withDefault(''),
  sort: parseAsStringLiteral(TEAM_SORTS).withDefault('name'),
  team: parseAsString,
}

export const loadTeamsSearchParams = createLoader(teamsSearchParams)
