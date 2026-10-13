// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { CONNECTIONS_ERROR_CODES } from './errors.js'
import {
  CONNECTION_AUTH_TYPES,
  CONNECTION_KINDS,
  CONNECTION_SCOPES,
  CONNECTION_STATUSES,
  connectionBaseUrlSchema,
  connectionExtraSchema,
  connectionNameSchema,
  connectionProviderKeySchema,
  connectionSecretValueSchema,
  OAUTH_FLOW_TYPES,
} from './providers.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { teamRefDtoSchema } from '../teams/schemas.js'
import { IMPACT_LISTED_MAX } from '../vault/schemas.js'

// Connections: accounts in other apps that SurefyOS calls on the organization's behalf
// (database/bridge-and-connections.md §1; Settings › Connections, the Add connection dialog, and
// the connection pickers of agent tools, channels and knowledge connectors). Routes, all under
// /api/v1/orgs/:orgId/connections:
// GET /providers · GET / · POST / (key, token, basic, no sign-in, OAuth client credentials) ·
// POST /oauth/start · POST /oauth/complete ·
// GET/PATCH /:connectionId · GET …/:connectionId/impact ·
// POST …/:connectionId/{reconnect,test,revoke}.
// Secrets and tokens travel only in create, reconnect and the OAuth completion; no response carries
// one. Save runs the provider check itself and answers with the failure code when it does not
// pass, so a connection is never stored untried.

/** Why a connection is not `active`, or why a check failed (all values are API error codes). */
export const CONNECTION_STATUS_REASON_CODES = [
  CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED,
  CONNECTIONS_ERROR_CODES.CONNECTION_REFRESH_FAILED,
  CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
  CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE,
] as const
export type ConnectionStatusReasonCode = (typeof CONNECTION_STATUS_REASON_CODES)[number]
export const connectionStatusReasonCodeSchema = z.enum(CONNECTION_STATUS_REASON_CODES)

/** How long a started OAuth sign-in stays valid before `oauth/complete` rejects its state. */
export const OAUTH_STATE_TTL_MINUTES = 10

// ── The connection ──────────────────────────────────────────────────────────────────────────────

/**
 * A connection as the list and the pickers show it. `secretLast4` is the masked value and is null
 * for OAuth, for `none` and for another person's personal connection; the secret and the tokens
 * are never returned. `connectedBy` is named in "Ask {connected by} to reconnect".
 */
export const connectionDtoSchema = z.object({
  id: z.uuid(),
  providerKey: connectionProviderKeySchema,
  kind: z.enum(CONNECTION_KINDS),
  /** Set when the connection was created for a bridge (V2). */
  bridgeId: z.uuid().nullable(),
  authType: z.enum(CONNECTION_AUTH_TYPES),
  name: z.string(),
  scope: z.enum(CONNECTION_SCOPES),
  team: teamRefDtoSchema.nullable(),
  /** The owner of a personal connection. */
  owner: userRefDtoSchema.nullable(),
  baseUrl: z.string().nullable(),
  secretLast4: z.string().nullable(),
  /** Scopes the provider granted (may be fewer than requested). */
  oauthScopes: z.array(z.string()).nullable(),
  /** `maya@acme.com`, `Acme Slack`: the account as the provider names it. */
  externalAccountLabel: z.string().nullable(),
  status: z.enum(CONNECTION_STATUSES),
  statusReasonCode: connectionStatusReasonCodeSchema.nullable(),
  tokenExpiresAt: z.iso.datetime().nullable(),
  lastRefreshedAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  /** Agents, flows, knowledge sources and channels that use it ("Used by 3"). */
  usedByCount: z.number().int().nonnegative(),
  connectedBy: userRefDtoSchema.nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ConnectionDto = z.infer<typeof connectionDtoSchema>

export const connectionParamsSchema = orgParamsSchema.extend({ connectionId: z.uuid() })
export type ConnectionParams = z.infer<typeof connectionParamsSchema>

/** `GET …/providers`: what the Add connection dialog offers on this install. */
export const connectionProviderDtoSchema = z.object({
  providerKey: connectionProviderKeySchema,
  kind: z.enum(CONNECTION_KINDS),
  authTypes: z.array(z.enum(CONNECTION_AUTH_TYPES)),
  oauthFlows: z.array(z.enum(OAUTH_FLOW_TYPES)),
  requiresBaseUrl: z.boolean(),
  requiredExtra: z.array(z.string()),
  /** OAuth 2 sign-in is offered only when the install has the provider's OAuth app configured. */
  oauthConfigured: z.boolean(),
  /** Non-revoked connections of this provider the caller may use. */
  connectionCount: z.number().int().nonnegative(),
})
export type ConnectionProviderDto = z.infer<typeof connectionProviderDtoSchema>

export const CONNECTION_SORT_FIELDS = ['name', 'createdAt', 'lastUsedAt'] as const

export const listConnectionsQuerySchema = pageQuery.extend({
  q: searchQuery,
  providerKey: multiValueQuery(connectionProviderKeySchema),
  kind: multiValueQuery(z.enum(CONNECTION_KINDS)),
  scope: multiValueQuery(z.enum(CONNECTION_SCOPES)),
  status: multiValueQuery(z.enum(CONNECTION_STATUSES)),
  teamId: z.uuid().optional(),
  /** Only connections the caller may use: the pickers of tools, channels and connectors. */
  usable: z.stringbool().optional(),
  sort: sortQuery(CONNECTION_SORT_FIELDS),
})
export type ListConnectionsQuery = z.infer<typeof listConnectionsQuerySchema>

// ── Adding a connection ─────────────────────────────────────────────────────────────────────────

/** Where a connection lives: `team` needs `teamId`, the other scopes forbid it. */
const targetShape = {
  providerKey: connectionProviderKeySchema,
  name: connectionNameSchema.optional(),
  scope: z.enum(CONNECTION_SCOPES),
  teamId: z.uuid().optional(),
  baseUrl: connectionBaseUrlSchema.optional(),
  extra: connectionExtraSchema.optional(),
} as const

const hasConsistentTeam = (target: { scope: string; teamId?: string }) =>
  (target.scope === 'team') === (target.teamId !== undefined)

/** Credentials by way of signing in; the same shapes serve create and reconnect. */
const apiKeyCredentialSchema = z.object({
  authType: z.literal('api_key'),
  secret: connectionSecretValueSchema,
})
const bearerCredentialSchema = z.object({
  authType: z.literal('bearer'),
  secret: connectionSecretValueSchema,
})
const basicCredentialSchema = z.object({
  authType: z.literal('basic'),
  username: connectionSecretValueSchema,
  password: connectionSecretValueSchema,
})
const noneCredentialSchema = z.object({ authType: z.literal('none') })
/** The `client_credentials` flow: the server fetches its own tokens, nothing redirects. */
const clientCredentialsSchema = z.object({
  authType: z.literal('oauth2'),
  tokenUrl: connectionBaseUrlSchema,
  clientId: connectionSecretValueSchema,
  clientSecret: connectionSecretValueSchema,
  oauthScopes: z.array(z.string().min(1).max(200)).max(50).optional(),
})

/**
 * `POST …/connections`: everything that signs in without a browser redirect. Personal connections
 * need `connections:use`; team and organization ones need `connections:manage`. The authorization
 * code flow goes through `oauth/start` instead. Save runs the provider check.
 */
export const createConnectionInputSchema = z
  .discriminatedUnion('authType', [
    apiKeyCredentialSchema.extend(targetShape),
    bearerCredentialSchema.extend(targetShape),
    basicCredentialSchema.extend(targetShape),
    noneCredentialSchema.extend(targetShape),
    clientCredentialsSchema.extend(targetShape),
  ])
  .refine(hasConsistentTeam)
export type CreateConnectionInput = z.infer<typeof createConnectionInputSchema>

/** `POST …/:connectionId/reconnect`: new credentials for a connection that is not an OAuth code flow. */
export const reconnectConnectionInputSchema = z.discriminatedUnion('authType', [
  apiKeyCredentialSchema,
  bearerCredentialSchema,
  basicCredentialSchema,
  clientCredentialsSchema,
])
export type ReconnectConnectionInput = z.infer<typeof reconnectConnectionInputSchema>

/** `PATCH …/:connectionId`: the label and, for self-hosted apps and MCP servers, the address. */
export const updateConnectionInputSchema = z
  .object({ name: connectionNameSchema, baseUrl: connectionBaseUrlSchema })
  .partial()
export type UpdateConnectionInput = z.infer<typeof updateConnectionInputSchema>

// ── OAuth authorization code flow ───────────────────────────────────────────────────────────────

/** A relative path of the workspace to return to after sign-in; never an absolute URL. */
export const oauthReturnToSchema = z
  .string()
  .regex(/^\/(?!\/)/)
  .max(2048)

/**
 * `POST …/oauth/start`: begins a sign-in for a new connection, or, with `reconnectConnectionId`,
 * for an existing one (the target fields must then match it).
 */
export const startOauthInputSchema = z
  .object({
    ...targetShape,
    /** Reconnect: the connection whose grant is replaced. */
    reconnectConnectionId: z.uuid().optional(),
    returnTo: oauthReturnToSchema.optional(),
  })
  .refine(hasConsistentTeam)
export type StartOauthInput = z.infer<typeof startOauthInputSchema>

/** The browser goes to `authorizationUrl`; `state` comes back to the workspace's callback page. */
export const oauthStartDtoSchema = z.object({
  flow: z.literal('authorization_code'),
  authorizationUrl: z.url({ protocol: /^https?$/ }),
  state: z.string().min(1).max(512),
  expiresAt: z.iso.datetime(),
})
export type OauthStartDto = z.infer<typeof oauthStartDtoSchema>

/**
 * `POST …/oauth/complete`: what the callback page received. Either `code` or `error` is present;
 * the answer is the created or reconnected connection (or `CONNECTION_OAUTH_DENIED`).
 */
export const completeOauthInputSchema = z
  .object({
    state: z.string().min(1).max(512),
    code: z.string().min(1).max(4096).optional(),
    error: z.string().min(1).max(200).optional(),
    errorDescription: z.string().max(1000).optional(),
  })
  .refine((input) => (input.code !== undefined) !== (input.error !== undefined))
export type CompleteOauthInput = z.infer<typeof completeOauthInputSchema>

export const oauthCompleteDtoSchema = z.object({
  connection: connectionDtoSchema,
  /** `created` or `reconnected`. */
  outcome: z.enum(['created', 'reconnected']),
  /** The path the sign-in was started from. */
  returnTo: z.string().nullable(),
})
export type OauthCompleteDto = z.infer<typeof oauthCompleteDtoSchema>

// ── Check ───────────────────────────────────────────────────────────────────────────────────────

/** `POST …/:connectionId/test`: a failed check is a normal answer (`ok: false`), not an HTTP error. */
export const connectionCheckDtoSchema = z.object({
  ok: z.boolean(),
  /** Round trip of the check call; null when nothing answered. */
  latencyMs: z.number().int().nonnegative().nullable(),
  reasonCode: connectionStatusReasonCodeSchema.nullable(),
  externalAccountLabel: z.string().nullable(),
  /** The connection after the check (status and reason updated). */
  connection: connectionDtoSchema,
  testedAt: z.iso.datetime(),
})
export type ConnectionCheckDto = z.infer<typeof connectionCheckDtoSchema>

// ── Impact: what a disconnect affects (T2 dialog) ───────────────────────────────────────────────

/**
 * What depends on a connection (from `dependency_edges`): agents, flows, knowledge sources and
 * channels ("3 agents will lose their Slack tool"). Counts cover all of them; names are capped.
 */
export const connectionImpactDtoSchema = z.object({
  dependents: z.array(z.object({ type: z.string(), count: z.number().int().nonnegative() })),
  listed: z
    .array(z.object({ type: z.string(), id: z.uuid(), name: z.string() }))
    .max(IMPACT_LISTED_MAX),
})
export type ConnectionImpactDto = z.infer<typeof connectionImpactDtoSchema>
