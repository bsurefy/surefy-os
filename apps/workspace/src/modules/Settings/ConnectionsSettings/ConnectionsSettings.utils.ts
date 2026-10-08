// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import type {
  ConnectionDto,
  ConnectionImpactDto,
  ConnectionProviderDto,
  ConnectionScope,
  CreateConnectionInput,
  ReconnectConnectionInput,
  StartOauthInput,
} from '@surefy/contracts'

import {
  CONNECTION_ATTENTION_STATUSES,
  PROVIDER_EXTRA_FIELDS,
  SIGN_IN_METHOD,
  SIGN_IN_METHOD_ORDER,
} from './ConnectionsSettings.constants'

import type { SignInMethod } from './ConnectionsSettings.constants'
import type { ExtraField, SignInValues } from './ConnectionsSettings.schema'

/** The sort the table shows: `-name` is name descending. */
export function toSortParam(sort: string): { id: string; desc: boolean } {
  return sort.startsWith('-') ? { id: sort.slice(1), desc: true } : { id: sort, desc: false }
}

/** Expired or erroring: the banner counts it and the row carries a Reconnect button. */
export function needsAttention(connection: Pick<ConnectionDto, 'status'>): boolean {
  return CONNECTION_ATTENTION_STATUSES.some((status) => status === connection.status)
}

/** Rows needing attention first, each group in the order the server sent. */
export function sortAttentionFirst(rows: readonly ConnectionDto[]): ConnectionDto[] {
  return [...rows.filter(needsAttention), ...rows.filter((row) => !needsAttention(row))]
}

export interface ConnectionAbilities {
  /** Admins and Owners (`connections:manage`): anyone's connections. */
  canManage: boolean
  /** The signed-in person; Builders act on what they connected. */
  userId: string | undefined
}

/** Whether the person connected it or owns it (a personal connection). */
export function isOwnConnection(connection: ConnectionDto, userId: string | undefined): boolean {
  if (!userId) return false
  return connection.connectedBy?.id === userId || connection.owner?.id === userId
}

export interface RowActions {
  test: boolean
  reconnect: boolean
  rename: boolean
  /** Custom APIs and MCP servers have an address to edit. */
  editAddress: boolean
  disconnect: boolean
}

const NO_ACTIONS: RowActions = {
  test: false,
  reconnect: false,
  rename: false,
  editAddress: false,
  disconnect: false,
}

/** What the ⋯ menu offers for a row; a disconnected connection offers nothing. */
export function getRowActions(
  connection: ConnectionDto,
  { canManage, userId }: ConnectionAbilities,
): RowActions {
  if (connection.status === 'revoked') return NO_ACTIONS
  if (!canManage && !isOwnConnection(connection, userId)) return NO_ACTIONS
  return {
    test: true,
    // a connection without a sign-in has no credentials to replace
    reconnect: connection.authType !== 'none',
    rename: true,
    editAddress: connection.baseUrl !== null,
    disconnect: true,
  }
}

/** The masked end of a key: `…a4f2`; OAuth connections show no value. */
export function maskSecret(secretLast4: string | null): string | null {
  return secretLast4 ? `…${secretLast4}` : null
}

/** An app card is disabled when no way of signing in works on this install. */
export function getSignInMethods(provider: ConnectionProviderDto): SignInMethod[] {
  const methods = new Set<SignInMethod>()
  for (const authType of provider.authTypes) {
    if (authType === 'oauth2') {
      if (provider.oauthFlows.includes('authorization_code') && provider.oauthConfigured) {
        methods.add(SIGN_IN_METHOD.OAUTH)
      }
      if (provider.oauthFlows.includes('client_credentials')) {
        methods.add(SIGN_IN_METHOD.CLIENT_CREDENTIALS)
      }
    } else {
      methods.add(authType)
    }
  }
  return SIGN_IN_METHOD_ORDER.filter((method) => methods.has(method))
}

/** The fields the app asks for beyond the common ones. */
export function getExtraFields(provider: ConnectionProviderDto): ExtraField[] {
  const keys = new Set([
    ...provider.requiredExtra,
    ...(PROVIDER_EXTRA_FIELDS[provider.providerKey] ?? []),
  ])
  return [...keys].map((key) => ({ key, isRequired: provider.requiredExtra.includes(key) }))
}

/** Which scopes a person may pick: Just me for Builders and above, the others for managers. */
export function getAllowedScopes(canManage: boolean): ConnectionScope[] {
  return canManage ? ['personal', 'team', 'organization'] : ['personal']
}

export interface ConnectionTarget {
  scope: ConnectionScope
  teamId?: string
}

function parseScopes(value: string): string[] | undefined {
  const scopes = value.split(/[\s,]+/).filter(Boolean)
  return scopes.length > 0 ? scopes : undefined
}

function withoutEmpty(extra: Record<string, string>): Record<string, string> | undefined {
  const entries = Object.entries(extra).filter(([, value]) => value !== '')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/** The target fields both `create` and `oauth/start` carry. */
function toTarget(
  provider: ConnectionProviderDto,
  values: SignInValues,
  { scope, teamId }: ConnectionTarget,
) {
  return {
    providerKey: provider.providerKey,
    name: values.name || undefined,
    scope,
    ...(scope === 'team' && teamId ? { teamId } : {}),
    baseUrl: values.baseUrl || undefined,
    extra: withoutEmpty(values.extra),
  }
}

/** The request that adds a connection by key, token, password, client credentials or no sign-in. */
export function buildCreateInput(
  method: Exclude<SignInMethod, 'oauth'>,
  provider: ConnectionProviderDto,
  values: SignInValues,
  target: ConnectionTarget,
): CreateConnectionInput {
  const base = toTarget(provider, values, target)
  switch (method) {
    case SIGN_IN_METHOD.API_KEY:
      return { ...base, authType: 'api_key', secret: values.secret }
    case SIGN_IN_METHOD.BEARER:
      return { ...base, authType: 'bearer', secret: values.secret }
    case SIGN_IN_METHOD.BASIC:
      return { ...base, authType: 'basic', username: values.username, password: values.password }
    case SIGN_IN_METHOD.CLIENT_CREDENTIALS:
      return {
        ...base,
        authType: 'oauth2',
        tokenUrl: values.tokenUrl,
        clientId: values.clientId,
        clientSecret: values.clientSecret,
        oauthScopes: parseScopes(values.oauthScopes),
      }
    case SIGN_IN_METHOD.NONE:
      return { ...base, authType: 'none' }
  }
}

/** The request that begins an OAuth sign-in; `returnTo` is where the callback sends the person back. */
export function buildStartOauthInput(
  provider: ConnectionProviderDto,
  values: SignInValues,
  target: ConnectionTarget,
  returnTo: string,
): StartOauthInput {
  return { ...toTarget(provider, values, target), returnTo }
}

/** New credentials for a connection that is not an authorization code sign-in. */
export function buildReconnectInput(
  connection: Pick<ConnectionDto, 'authType'>,
  values: SignInValues,
): ReconnectConnectionInput | null {
  switch (connection.authType) {
    case 'api_key':
      return { authType: 'api_key', secret: values.secret }
    case 'bearer':
      return { authType: 'bearer', secret: values.secret }
    case 'basic':
      return { authType: 'basic', username: values.username, password: values.password }
    case 'oauth2':
      return values.clientId
        ? {
            authType: 'oauth2',
            tokenUrl: values.tokenUrl,
            clientId: values.clientId,
            clientSecret: values.clientSecret,
            oauthScopes: parseScopes(values.oauthScopes),
          }
        : null
    case 'none':
      return null
  }
}

/** The sign-in method a reconnect asks for, from how the connection was made. */
export function getReconnectMethod(
  connection: Pick<ConnectionDto, 'authType' | 'externalAccountLabel'>,
): SignInMethod {
  if (connection.authType === 'oauth2') {
    // an authorization code sign-in names its account; client credentials do not
    return connection.externalAccountLabel
      ? SIGN_IN_METHOD.OAUTH
      : SIGN_IN_METHOD.CLIENT_CREDENTIALS
  }
  return connection.authType
}

/** A same-origin relative path or the fallback; never an absolute URL (open redirect). */
export function safeReturnPath(returnTo: string | null | undefined, fallback: string): string {
  return returnTo && /^\/(?!\/)/.test(returnTo) ? returnTo : fallback
}

export interface ImpactSummary {
  /** Dependents by type, with the ones the API listed by name and how many are beyond them. */
  groups: {
    type: string
    count: number
    items: { id: string; name: string }[]
    names: string[]
    more: number
  }[]
  total: number
}

export function getImpactSummary(impact: ConnectionImpactDto): ImpactSummary {
  const groups = impact.dependents
    .filter((dependent) => dependent.count > 0)
    .map(({ type, count }) => {
      const items = impact.listed
        .filter((item) => item.type === type)
        .map(({ id, name }) => ({ id, name }))
      const names = items.map((item) => item.name)
      return { type, count, items, names, more: Math.max(0, count - names.length) }
    })
  return { groups, total: groups.reduce((sum, group) => sum + group.count, 0) }
}

const REASON_KEY_BY_CODE: Record<string, string> = {
  [CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED]: 'expired',
  [CONNECTIONS_ERROR_CODES.CONNECTION_REFRESH_FAILED]: 'refreshFailed',
  [CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED]: 'rejected',
  [CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE]: 'unreachable',
}

/** The message key under `settings.connections.reasons` for a row's status reason. */
export function getReasonKey(code: string | null): string | null {
  return code ? (REASON_KEY_BY_CODE[code] ?? null) : null
}
