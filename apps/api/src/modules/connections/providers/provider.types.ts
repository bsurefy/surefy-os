// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ConnectionAuthType,
  ConnectionSecret,
  ConnectionStatusReasonCode,
} from '@surefy/contracts'

import type { OutboundHttp } from '../connectionsHttp.js'

// One adapter per built-in integration. It knows the app's addresses and answers, and nothing
// else: storage, access and status are the service's. Vendor response shapes stay in the file of
// the adapter that reads them (integrations.md, §1).

/** The install's OAuth app for a provider (`CONNECTIONS_OAUTH_*`). */
export interface OauthApp {
  clientId: string
  clientSecret: string
}

/** The account as the app names it (`maya@acme.com`, `Acme Slack`). */
export interface ProviderAccount {
  id: string | null
  label: string | null
}

export interface OauthTokens {
  accessToken: string
  refreshToken?: string
  /** Seconds until the access token expires; absent when the app issues tokens that do not. */
  expiresInSeconds?: number
  scopes: string[]
}

export interface CheckInput {
  authType: ConnectionAuthType
  secret: ConnectionSecret
  baseUrl: string | null
}

export type CheckOutcome =
  | { ok: true; latencyMs: number; account: ProviderAccount }
  | {
      ok: false
      reasonCode: ConnectionStatusReasonCode
      latencyMs: number | null
      /** The address is one SurefyOS may not call (private, or plain http off the local list). */
      unsafeAddress?: boolean
    }

/** The app refused a token request: `denied` (the person's choice), `rejected` or `unreachable`. */
export class TokenRequestError extends Error {
  constructor(
    readonly kind: 'denied' | 'rejected' | 'unreachable',
    message: string,
    /** The app's own error code (`invalid_grant`), when it sent one. */
    readonly providerCode: string | null = null,
    /** The address is one SurefyOS may not call (a typed-in token URL). */
    readonly unsafeAddress = false,
  ) {
    super(message)
    this.name = 'TokenRequestError'
  }
}

export interface AuthorizationUrlInput {
  app: OauthApp
  redirectUri: string
  state: string
  codeChallenge: string
  scopes: readonly string[]
}

export interface ExchangeCodeInput {
  app: OauthApp
  redirectUri: string
  code: string
  codeVerifier: string
}

export interface AuthorizationCodeFlow {
  /** Whether the app takes a PKCE challenge; the others ignore the verifier. */
  pkce: boolean
  defaultScopes: readonly string[]
  authorizationUrl(input: AuthorizationUrlInput): string
  exchangeCode(http: OutboundHttp, input: ExchangeCodeInput): Promise<OauthTokens>
  /** Absent when the app's tokens do not expire. */
  refresh?(http: OutboundHttp, input: { app: OauthApp; refreshToken: string }): Promise<OauthTokens>
  /** Revokes the grant at the app; best effort, after the disconnect committed. */
  revoke?(http: OutboundHttp, input: { app: OauthApp; secret: ConnectionSecret }): Promise<void>
}

export interface ProviderAdapter {
  key: string
  authorizationCode?: AuthorizationCodeFlow
  /** Tries the credentials against the app and names the account they belong to. */
  check(http: OutboundHttp, input: CheckInput): Promise<CheckOutcome>
}
