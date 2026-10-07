// SPDX-License-Identifier: AGPL-3.0-only

/** The MVP tabs, in order; each is a route (`/settings/vault/<tab>`). Decision models, Routing and Credits come later. */
export const VAULT_TABS = ['providers', 'local-models', 'model-access', 'fallback'] as const
export type VaultTab = (typeof VAULT_TABS)[number]
export const DEFAULT_VAULT_TAB: VaultTab = 'providers'

/** Provider and server names are brand names; they are not translated. */
export const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  openai_compatible: 'OpenAI-compatible',
  ollama: 'Ollama',
  vllm: 'vLLM',
  llamacpp: 'llama.cpp',
  lmstudio: 'LM Studio',
  searxng: 'SearXNG',
  brave: 'Brave',
  tavily: 'Tavily',
}

/** Names for the team and person pickers come from the first page of this size. */
export const PEOPLE_LOOKUP_LIMIT = 100

export const KEYS_PAGE_SIZE = 50

/** Values of the "who may use this model" picker: everyone, or a team or person by prefixed id. */
export const ACCESS_SUBJECT = {
  ORGANIZATION: 'organization',
  TEAM_PREFIX: 'team:',
  USER_PREFIX: 'user:',
} as const

export const ACCESS_VIEW = { LIST: 'list', MATRIX: 'matrix' } as const
export type AccessView = (typeof ACCESS_VIEW)[keyof typeof ACCESS_VIEW]

export const KEY_SCOPE = { ORGANIZATION: 'organization', TEAM: 'team' } as const
export type KeyScope = (typeof KEY_SCOPE)[keyof typeof KEY_SCOPE]

/** `?add=key` or `?add=server` opens the matching dialog (the command palette's "Add API key"). */
export const ADD_PARAM_VALUES = ['key', 'server'] as const
