// SPDX-License-Identifier: AGPL-3.0-only
import { GuardPiiBlockedError } from './guard.errors.js'

import type { PiiFilter } from './guard.pii.js'
import type { SearchPii } from '@/integrations/search/index.js'

/**
 * The personal-data filter for web search queries (integrations.md, §6): a query always leaves the
 * network for a search provider, so the cloud rules apply. A type set to block ends the search.
 */
export function createSearchPii(filter: Pick<PiiFilter, 'apply'>): SearchPii {
  return {
    async filter(input) {
      try {
        const result = await filter.apply({
          orgId: input.orgId,
          texts: [input.text],
          teamIds: input.teamIds,
          agentId: input.agentId ?? null,
          dataLocation: 'cloud',
          ...(input.locale === undefined ? {} : { locale: input.locale }),
          ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        })
        return { text: result.texts[0] ?? input.text, masked: result.masked }
      } catch (error) {
        if (error instanceof GuardPiiBlockedError) return { blocked: true }
        throw error
      }
    },
  }
}
