// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

// The provider registry behind `connections.provider_key` (database/bridge-and-connections.md §1).
// The registry is open: the app validates the key's shape, and the table below names the built-in
// integrations the workspace offers. Bridge keys (`slack`, `google-sheets`) arrive with V2.

/** What a connection is used for; it decides where its picker appears. */
export const CONNECTION_KINDS = [
  'knowledge_connector',
  'api_tool',
  'mcp_server',
  'channel',
  'bridge',
] as const
export type ConnectionKind = (typeof CONNECTION_KINDS)[number]

export const CONNECTION_AUTH_TYPES = ['oauth2', 'api_key', 'basic', 'bearer', 'none'] as const
export type ConnectionAuthType = (typeof CONNECTION_AUTH_TYPES)[number]

/** Who can use the connection: just its owner, a team's members, or the whole organization. */
export const CONNECTION_SCOPES = ['personal', 'team', 'organization'] as const
export type ConnectionScope = (typeof CONNECTION_SCOPES)[number]

/**
 * `active → expired` (token past expiry and refresh failed, or the provider reports the grant
 * revoked) · `active → error` (the provider rejects calls for another reason) ·
 * `expired | error → active` (Reconnect, or a later refresh succeeds) · any → `revoked` (terminal).
 */
export const CONNECTION_STATUSES = ['active', 'expired', 'revoked', 'error'] as const
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number]

/**
 * How a person signs in to an OAuth 2 provider. `authorization_code` sends the browser to the
 * provider (always with PKCE, then back to the workspace's callback page); `client_credentials`
 * is server to server: the person pastes a client ID and secret, and no browser redirect happens.
 */
export const OAUTH_FLOW_TYPES = ['authorization_code', 'client_credentials'] as const
export type OauthFlowType = (typeof OAUTH_FLOW_TYPES)[number]

/** Bridge keys contain hyphens (`google-sheets`); built-in integrations use the same shape. */
export const CONNECTION_PROVIDER_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
export const connectionProviderKeySchema = z.string().regex(CONNECTION_PROVIDER_KEY_PATTERN).max(50)

export interface ConnectionProviderDefinition {
  readonly key: string
  readonly kind: ConnectionKind
  /** Ways to sign in, the preferred one first. */
  readonly authTypes: readonly ConnectionAuthType[]
  /** The OAuth 2 flows the provider supports, when `authTypes` has `oauth2`. */
  readonly oauthFlows: readonly OauthFlowType[]
  /** The address of the account's server is asked for: required, never optional. */
  readonly requiresBaseUrl: boolean
  /** Provider-specific `extra` fields the connection must carry (a WhatsApp phone number ID). */
  readonly requiredExtra: readonly string[]
}

/** Built-in integrations (V1). Bridge providers are added to the registry by the bridge catalog (V2). */
export const BUILT_IN_CONNECTION_PROVIDERS = [
  {
    key: 'google-drive',
    kind: 'knowledge_connector',
    authTypes: ['oauth2'],
    oauthFlows: ['authorization_code'],
    requiresBaseUrl: false,
    requiredExtra: [],
  },
  {
    key: 'notion',
    kind: 'knowledge_connector',
    authTypes: ['oauth2', 'bearer'],
    oauthFlows: ['authorization_code'],
    requiresBaseUrl: false,
    requiredExtra: [],
  },
  {
    key: 'slack',
    kind: 'channel',
    authTypes: ['oauth2'],
    oauthFlows: ['authorization_code'],
    requiresBaseUrl: false,
    requiredExtra: [],
  },
  {
    key: 'whatsapp',
    kind: 'channel',
    authTypes: ['bearer'],
    oauthFlows: [],
    requiresBaseUrl: false,
    requiredExtra: ['phoneNumberId'],
  },
  {
    key: 'http',
    kind: 'api_tool',
    authTypes: ['api_key', 'bearer', 'basic', 'oauth2', 'none'],
    oauthFlows: ['client_credentials'],
    requiresBaseUrl: true,
    requiredExtra: [],
  },
  {
    key: 'mcp',
    kind: 'mcp_server',
    authTypes: ['oauth2', 'bearer', 'api_key', 'none'],
    oauthFlows: ['authorization_code', 'client_credentials'],
    requiresBaseUrl: true,
    requiredExtra: [],
  },
] as const satisfies readonly ConnectionProviderDefinition[]

export type BuiltInConnectionProviderKey = (typeof BUILT_IN_CONNECTION_PROVIDERS)[number]['key']
export const BUILT_IN_CONNECTION_PROVIDER_KEYS = BUILT_IN_CONNECTION_PROVIDERS.map(
  (provider) => provider.key,
) as readonly BuiltInConnectionProviderKey[]

/** The registry entry of a built-in provider, or undefined for a bridge or an unknown key. */
export function findBuiltInConnectionProvider(
  key: string,
): ConnectionProviderDefinition | undefined {
  return BUILT_IN_CONNECTION_PROVIDERS.find((provider) => provider.key === key)
}

export const connectionNameSchema = z.string().trim().min(1).max(100)

/** A token, key or password pasted by a person; sent in create and reconnect requests only. */
export const connectionSecretValueSchema = z.string().trim().min(1).max(4096)

/** `https` only; `http` is accepted for hosts on the install's allow-list for local servers. */
export const connectionBaseUrlSchema = z.url({ protocol: /^https?$/ }).max(2048)

/** Provider-specific fields (a WhatsApp `phoneNumberId`); at most 20 short values. */
export const CONNECTION_EXTRA_MAX_ENTRIES = 20
export const connectionExtraSchema = z
  .record(z.string().min(1).max(50), z.string().max(1000))
  .refine((extra) => Object.keys(extra).length <= CONNECTION_EXTRA_MAX_ENTRIES)

/**
 * `ConnectionSecret` v1: the one JSON document `secret_ciphertext` holds. It is decrypted only in
 * the `connections` service and injected per execution; no request or response carries it whole.
 */
export const connectionSecretSchema = z.object({
  version: z.literal(1),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  apiKey: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
  extra: z.record(z.string(), z.string()).optional(),
})
export type ConnectionSecret = z.infer<typeof connectionSecretSchema>
