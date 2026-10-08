// SPDX-License-Identifier: AGPL-3.0-only
import { parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { AGENT_FILTERS, AGENT_OWNERS, AGENT_SORTS, AGENT_VIEWS } from './AgentsList.constants'

/** `?q=&filter=&owner=&sort=&view=`: the list's filters survive a reload and can be shared. */
export const agentsListSearchParams = {
  q: parseAsString.withDefault(''),
  filter: parseAsStringLiteral(AGENT_FILTERS).withDefault('all'),
  owner: parseAsStringLiteral(AGENT_OWNERS).withDefault('anyone'),
  sort: parseAsStringLiteral(AGENT_SORTS).withDefault('lastRun'),
  view: parseAsStringLiteral(AGENT_VIEWS).withDefault('cards'),
}
