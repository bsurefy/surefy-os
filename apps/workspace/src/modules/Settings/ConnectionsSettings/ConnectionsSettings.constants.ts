// SPDX-License-Identifier: AGPL-3.0-only
import type { ConnectionKind, ConnectionStatus } from '@surefy/contracts'

/**
 * What the Status filter offers. Disconnected connections stay hidden until that filter is chosen,
 * so "all" lists the other three states.
 */
export const CONNECTION_STATUS_FILTERS = ['all', 'active', 'attention', 'disconnected'] as const
export type ConnectionStatusFilter = (typeof CONNECTION_STATUS_FILTERS)[number]

/** The API statuses behind each filter value. */
export const CONNECTION_STATUS_GROUPS: Record<ConnectionStatusFilter, readonly ConnectionStatus[]> =
  {
    all: ['active', 'expired', 'error'],
    active: ['active'],
    attention: ['expired', 'error'],
    disconnected: ['revoked'],
  }

/** Statuses that need a person to act: the banner counts them and their rows sort first. */
export const CONNECTION_ATTENTION_STATUSES = CONNECTION_STATUS_GROUPS.attention

/** The "any" choice of the select filters. */
export const ANY_FILTER = 'any'

/** "Used for" filter. Bridges join it with V2. */
export const CONNECTION_KIND_FILTERS = [
  'knowledge_connector',
  'api_tool',
  'mcp_server',
  'channel',
] as const satisfies readonly ConnectionKind[]

/** "Who can use it" filter: just the owner, a team or the organization. */
export const CONNECTION_SCOPE_FILTERS = ['personal', 'team', 'organization'] as const

export const CONNECTION_SORTS = [
  'name',
  '-name',
  'createdAt',
  '-createdAt',
  'lastUsedAt',
  '-lastUsedAt',
] as const
export type ConnectionSort = (typeof CONNECTION_SORTS)[number]

/** The dialogs of the Connections screen; one is open at a time. */
export const CONNECTION_DIALOG = {
  ADD: 'add',
  RECONNECT: 'reconnect',
  RENAME: 'rename',
  DISCONNECT: 'disconnect',
  USED_BY: 'usedBy',
} as const
export type ConnectionDialogKind = (typeof CONNECTION_DIALOG)[keyof typeof CONNECTION_DIALOG]

/** The steps of the Add connection dialog. */
export const ADD_STEP = { APP: 'app', SIGN_IN: 'signIn', SCOPE: 'scope' } as const
export type AddStep = (typeof ADD_STEP)[keyof typeof ADD_STEP]

/**
 * How a person can sign in to an app, as the dialog words it. `authorization_code` is "Sign in
 * with {app}"; an OAuth 2 app that takes a client ID and secret is `clientCredentials`.
 */
export const SIGN_IN_METHOD = {
  OAUTH: 'oauth',
  CLIENT_CREDENTIALS: 'clientCredentials',
  API_KEY: 'api_key',
  BEARER: 'bearer',
  BASIC: 'basic',
  NONE: 'none',
} as const
export type SignInMethod = (typeof SIGN_IN_METHOD)[keyof typeof SIGN_IN_METHOD]

/** The order the methods are offered in, most direct first. */
export const SIGN_IN_METHOD_ORDER: readonly SignInMethod[] = [
  SIGN_IN_METHOD.OAUTH,
  SIGN_IN_METHOD.API_KEY,
  SIGN_IN_METHOD.BEARER,
  SIGN_IN_METHOD.BASIC,
  SIGN_IN_METHOD.CLIENT_CREDENTIALS,
  SIGN_IN_METHOD.NONE,
]

/**
 * Extra fields an app asks for beyond the ones its registry entry requires (WhatsApp wants the
 * business account ID next to the phone number ID). Required ones come from `requiredExtra`.
 */
export const PROVIDER_EXTRA_FIELDS: Readonly<Record<string, readonly string[]>> = {
  whatsapp: ['phoneNumberId', 'businessAccountId'],
}

/** API tools and MCP servers share one group of cards: "Tools". */
export const PROVIDER_GROUP_OF_KIND: Record<ConnectionKind, 'knowledge' | 'channels' | 'tools'> = {
  knowledge_connector: 'knowledge',
  channel: 'channels',
  api_tool: 'tools',
  mcp_server: 'tools',
  bridge: 'tools',
}

/** Search params the app sends back on the return URL (RFC 6749 §4.1.2). */
export const OAUTH_RETURN_PARAMS = {
  STATE: 'state',
  CODE: 'code',
  ERROR: 'error',
  ERROR_DESCRIPTION: 'error_description',
} as const
