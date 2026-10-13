// SPDX-License-Identifier: AGPL-3.0-only
import type {
  CONNECTION_KIND_FILTERS,
  CONNECTION_SCOPE_FILTERS,
} from './ConnectionsSettings.constants'

export type ConnectionKindFilter = (typeof CONNECTION_KIND_FILTERS)[number]
export type ConnectionScopeFilter = (typeof CONNECTION_SCOPE_FILTERS)[number]
