// SPDX-License-Identifier: AGPL-3.0-only
import { findBuiltInConnectionProvider } from '@surefy/contracts'
import type {
  ConnectionAuthType,
  ConnectionProviderDefinition,
  ConnectionScope,
  OauthFlowType,
} from '@surefy/contracts'

import { canManage } from './connections.access.js'
import {
  ConnectionAuthTypeUnsupportedError,
  ConnectionBaseUrlNotAllowedError,
  ConnectionFieldInvalidError,
  ConnectionForbiddenError,
  ConnectionProviderUnsupportedError,
  ConnectionTeamNotFoundError,
} from './connections.errors.js'
import { isBaseUrlAllowed } from './connectionsHttp.js'

import type { ConnectionsContext, ConnectionsTeams } from './connections.types.js'
import type { ProviderAdapter } from './providers/index.js'
import type { DbExecutor } from '@/core/database/index.js'

/** Keys of `extra` the connection itself uses for an OAuth 2 client-credentials sign-in. */
export const CLIENT_CREDENTIALS_EXTRA = ['tokenUrl', 'clientId', 'clientSecret'] as const

export interface ResolvedProvider {
  definition: ConnectionProviderDefinition
  adapter: ProviderAdapter
}

/**
 * The checks that turn a request into a connection that may be stored: the provider is in the
 * registry, signs in this way, the address is allowed and the required fields are there, and the
 * person may add this scope (design/workspace/connections.md, §2 and §8).
 */
export class ConnectionTargets {
  constructor(
    private readonly deps: {
      adapters: ReadonlyMap<string, ProviderAdapter>
      teams: ConnectionsTeams
      localHosts: readonly string[]
    },
  ) {}

  provider(providerKey: string): ResolvedProvider {
    const definition = findBuiltInConnectionProvider(providerKey)
    const adapter = this.deps.adapters.get(providerKey)
    if (definition === undefined || adapter === undefined) {
      throw new ConnectionProviderUnsupportedError(providerKey)
    }
    return { definition, adapter }
  }

  assertAuthType(
    { definition }: ResolvedProvider,
    authType: ConnectionAuthType,
    flow?: OauthFlowType,
  ): void {
    const offered: readonly ConnectionAuthType[] = definition.authTypes
    if (!offered.includes(authType)) {
      throw new ConnectionAuthTypeUnsupportedError(definition.key, authType)
    }
    const flows: readonly OauthFlowType[] = definition.oauthFlows
    if (authType === 'oauth2' && flow !== undefined && !flows.includes(flow)) {
      throw new ConnectionAuthTypeUnsupportedError(definition.key, `oauth2:${flow}`)
    }
  }

  /** Personal needs a person; team and organization need `connections:manage`; a team must exist. */
  async assertCanAdd(
    tx: DbExecutor,
    ctx: ConnectionsContext,
    target: { scope: ConnectionScope; teamId?: string },
  ): Promise<void> {
    if (target.scope === 'personal') {
      if (ctx.userId === null) throw new ConnectionForbiddenError()
      return
    }
    if (!canManage(ctx)) throw new ConnectionForbiddenError()
    if (target.scope === 'team') {
      const [team] = await this.deps.teams.findRefsInTx(tx, ctx.orgId, [target.teamId ?? ''])
      if (team === undefined) throw new ConnectionTeamNotFoundError()
    }
  }

  /** Required for self-hosted apps and MCP servers, refused for the others; `https` or a local host. */
  baseUrl(provider: ResolvedProvider, baseUrl: string | undefined): string | null {
    const required = provider.definition.requiresBaseUrl
    if (baseUrl === undefined) {
      if (required) throw new ConnectionFieldInvalidError('baseUrl', 'An address is needed')
      return null
    }
    if (!required) {
      throw new ConnectionFieldInvalidError('baseUrl', 'This app has no address of its own')
    }
    this.assertAddress('baseUrl', baseUrl)
    return baseUrl
  }

  /** An address a person typed in: `https`, or `http` for a host on the install's local list. */
  assertAddress(field: string, url: string): void {
    if (!isBaseUrlAllowed(url, this.deps.localHosts)) {
      throw new ConnectionBaseUrlNotAllowedError(field)
    }
  }

  /** The provider-specific fields it needs (a WhatsApp phone number ID), and no others. */
  extra(
    provider: ResolvedProvider,
    extra: Record<string, string> | undefined,
  ): Record<string, string> {
    const given = extra ?? {}
    const missing = provider.definition.requiredExtra.filter(
      (key) => given[key] === undefined || given[key] === '',
    )
    if (missing.length > 0) {
      throw new ConnectionFieldInvalidError(`extra.${missing[0] ?? ''}`, 'A field is missing')
    }
    const reserved: readonly string[] = CLIENT_CREDENTIALS_EXTRA
    return Object.fromEntries(Object.entries(given).filter(([key]) => !reserved.includes(key)))
  }
}
