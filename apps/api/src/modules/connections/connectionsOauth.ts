// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import type {
  CompleteOauthInput,
  OauthCompleteDto,
  OauthStartDto,
  StartOauthInput,
} from '@surefy/contracts'

import { canChange } from './connections.access.js'
import { OAUTH_CALLBACK_PATH } from './connections.constants.js'
import {
  ConnectionAuthTypeUnsupportedError,
  ConnectionCheckFailedError,
  ConnectionFieldInvalidError,
  ConnectionForbiddenError,
  ConnectionNotFoundError,
  ConnectionOauthDeniedError,
  ConnectionOauthStateInvalidError,
  ConnectionRevokedError,
} from './connections.errors.js'
import { checkFailure } from './connectionsFailures.js'
import { newPkce, type OauthSession, type OauthStateStore } from './connectionsOauthState.js'
import { TokenRequestError } from './providers/index.js'

import type { ConnectionsRepository } from './connections.repository.js'
import type { ConnectionsContext } from './connections.types.js'
import type { OutboundHttp } from './connectionsHttp.js'
import type { ConnectionTargets } from './connectionsTargets.js'
import type { ConnectionWriter } from './connectionsWriter.js'
import type { OauthApp } from './providers/index.js'
import type { Database } from '@/core/database/index.js'

export interface ConnectionsOauthDeps {
  db: Database
  repository: ConnectionsRepository
  targets: ConnectionTargets
  writer: ConnectionWriter
  states: OauthStateStore
  http: OutboundHttp
  oauthApps: Readonly<Record<string, OauthApp | undefined>>
  /** `APP_ORIGIN`: the callback page lives on the workspace. */
  appOrigin: string
  now?: () => Date
}

/**
 * The authorization code flow (design/workspace/connections.md, §2 and §3): `start` stores the
 * attempt for ten minutes and sends the browser to the app (always with PKCE where the app takes
 * it); `complete` takes what the callback page received, trades the code for tokens outside any
 * transaction, checks the account and stores or replaces the connection. Nothing is stored for a
 * declined or failed sign-in.
 */
export class ConnectionsOauth {
  private readonly now: () => Date

  constructor(private readonly deps: ConnectionsOauthDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async start(ctx: ConnectionsContext, input: StartOauthInput): Promise<OauthStartDto> {
    if (ctx.userId === null) throw new ConnectionForbiddenError() // a sign-in needs a person
    const userId = ctx.userId
    const provider = this.deps.targets.provider(input.providerKey)
    const flow = provider.adapter.authorizationCode
    this.deps.targets.assertAuthType(provider, 'oauth2', 'authorization_code')
    const app = this.deps.oauthApps[input.providerKey]
    if (flow === undefined || app === undefined) {
      // "Not set up on this install"
      throw new ConnectionAuthTypeUnsupportedError(input.providerKey, 'oauth2:not_configured')
    }
    const baseUrl = this.deps.targets.baseUrl(provider, input.baseUrl)
    const extra = this.deps.targets.extra(provider, input.extra)

    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (input.reconnectConnectionId === undefined) {
        await this.deps.targets.assertCanAdd(tx, ctx, input)
        return
      }
      const row = await this.deps.repository.findById(tx, ctx.orgId, input.reconnectConnectionId)
      if (row === undefined) throw new ConnectionNotFoundError()
      if (!canChange(ctx, row)) throw new ConnectionForbiddenError()
      if (row.status === 'revoked') throw new ConnectionRevokedError()
      if (
        row.providerKey !== input.providerKey ||
        row.authType !== 'oauth2' ||
        row.scope !== input.scope ||
        row.teamId !== (input.teamId ?? null)
      ) {
        throw new ConnectionFieldInvalidError(
          'reconnectConnectionId',
          'The target does not match the connection',
        )
      }
    })

    const pkce = newPkce()
    const redirectUri = `${this.deps.appOrigin}${OAUTH_CALLBACK_PATH}`
    const { state, expiresAt } = await this.deps.states.create({
      orgId: ctx.orgId,
      userId,
      providerKey: input.providerKey,
      scope: input.scope,
      scopes: [...flow.defaultScopes],
      redirectUri,
      codeVerifier: pkce.verifier,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.teamId === undefined ? {} : { teamId: input.teamId }),
      ...(baseUrl === null ? {} : { baseUrl }),
      ...(Object.keys(extra).length === 0 ? {} : { extra }),
      ...(input.reconnectConnectionId === undefined
        ? {}
        : { reconnectConnectionId: input.reconnectConnectionId }),
      ...(input.returnTo === undefined ? {} : { returnTo: input.returnTo }),
    })
    return {
      flow: 'authorization_code',
      authorizationUrl: flow.authorizationUrl({
        app,
        redirectUri,
        state,
        codeChallenge: pkce.challenge,
        scopes: flow.defaultScopes,
      }),
      state,
      expiresAt: expiresAt.toISOString(),
    }
  }

  async complete(ctx: ConnectionsContext, input: CompleteOauthInput): Promise<OauthCompleteDto> {
    // the attempt is used once, whatever follows
    const session = await this.deps.states.take(input.state)
    if (session?.orgId !== ctx.orgId || session.userId !== ctx.userId) {
      throw new ConnectionOauthStateInvalidError()
    }
    if (input.error !== undefined || input.code === undefined) {
      throw new ConnectionOauthDeniedError(input.errorDescription ?? input.error ?? null)
    }
    return this.finish(ctx, session, input.code)
  }

  private async finish(
    ctx: ConnectionsContext,
    session: OauthSession,
    code: string,
  ): Promise<OauthCompleteDto> {
    const provider = this.deps.targets.provider(session.providerKey)
    const flow = provider.adapter.authorizationCode
    const app = this.deps.oauthApps[session.providerKey]
    if (flow === undefined || app === undefined) {
      throw new ConnectionAuthTypeUnsupportedError(session.providerKey, 'oauth2:not_configured')
    }
    let tokens
    try {
      tokens = await flow.exchangeCode(this.deps.http, {
        app,
        redirectUri: session.redirectUri,
        code,
        codeVerifier: session.codeVerifier,
      })
    } catch (error) {
      if (!(error instanceof TokenRequestError)) throw error
      if (error.kind === 'unreachable') {
        throw new ConnectionCheckFailedError(
          CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE,
          'Nothing answered at the app',
        )
      }
      throw new ConnectionOauthDeniedError(error.message)
    }
    const secret = {
      version: 1 as const,
      accessToken: tokens.accessToken,
      ...(tokens.refreshToken === undefined ? {} : { refreshToken: tokens.refreshToken }),
      ...(session.extra === undefined ? {} : { extra: session.extra }),
    }
    const outcome = await provider.adapter.check(this.deps.http, {
      authType: 'oauth2',
      secret,
      baseUrl: session.baseUrl ?? null,
    })
    if (!outcome.ok) throw checkFailure(outcome)
    const tokenExpiresAt =
      tokens.expiresInSeconds === undefined
        ? null
        : new Date(this.now().getTime() + tokens.expiresInSeconds * 1000)

    if (session.reconnectConnectionId !== undefined) {
      const connection = await this.deps.writer.reconnect(ctx, session.reconnectConnectionId, {
        secret,
        oauthScopes: tokens.scopes,
        tokenExpiresAt,
        account: outcome.account,
      })
      return { connection, outcome: 'reconnected', returnTo: session.returnTo ?? null }
    }
    const connection = await this.deps.writer.create(ctx, {
      providerKey: session.providerKey,
      authType: 'oauth2',
      name: session.name ?? outcome.account.label ?? session.providerKey,
      scope: session.scope,
      teamId: session.teamId ?? null,
      baseUrl: session.baseUrl ?? null,
      secret,
      oauthScopes: tokens.scopes,
      tokenExpiresAt,
      account: outcome.account,
    })
    return { connection, outcome: 'created', returnTo: session.returnTo ?? null }
  }
}
