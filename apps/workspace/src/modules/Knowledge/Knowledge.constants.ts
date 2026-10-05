// SPDX-License-Identifier: AGPL-3.0-only

/** The tabs of a knowledge base, in order; each is a route (`/knowledge/<id>/<tab>`). */
export const KNOWLEDGE_TABS = ['sources', 'test-search', 'access', 'settings'] as const
export type KnowledgeTab = (typeof KNOWLEDGE_TABS)[number]
export const DEFAULT_KNOWLEDGE_TAB: KnowledgeTab = 'sources'

/** The list of knowledge bases, or Recently deleted in its place. */
export const LIBRARY_VIEWS = ['bases', 'deleted'] as const
export type LibraryView = (typeof LIBRARY_VIEWS)[number]

/** The list's filter: everything, bases with a source that needs attention, or "Local models only". */
export const BASE_FILTERS = ['all', 'attention', 'local'] as const
export type BaseFilter = (typeof BASE_FILTERS)[number]

export const BASE_SORTS = ['name', '-name', 'updatedAt', '-updatedAt'] as const
export type BaseSort = (typeof BASE_SORTS)[number]

/** Wait after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 300

/** Names for the team and person pickers come from the first page of this size. */
export const PEOPLE_LOOKUP_LIMIT = 100

/** Teams shown in a team name column before "+N". */
export const ACCESS_TEAMS_SHOWN = 2

export const SOURCES_PAGE_SIZE = 50

/** The model types a knowledge base can embed with. */
export const EMBEDDING_MODEL_TYPE = 'embedding'

/** Hover and focus on the Test search tab: results are kept for this many passages on screen. */
export const SEARCH_PASSAGES_SHOWN = 20
