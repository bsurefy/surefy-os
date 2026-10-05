// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

// The provider registry behind `vault_credentials.provider_key` and `vault_models.provider_key`
// (database/vault-and-models.md §2). The registry is open: the app validates the key's shape, and
// the lists below name the providers the workspace offers.

export const CREDENTIAL_KINDS = [
  'ai_provider',
  'local_server',
  'search_provider',
  'decision_service',
] as const
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number]

export const CREDENTIAL_SCOPES = ['organization', 'team', 'personal'] as const
export type CredentialScope = (typeof CREDENTIAL_SCOPES)[number]

/**
 * `active ⇄ error`, `active ⇄ rate_limited`, `active|error|rate_limited → expired`,
 * `expired → active`, any state `→ revoked` (terminal).
 */
export const CREDENTIAL_STATUSES = [
  'active',
  'error',
  'rate_limited',
  'expired',
  'revoked',
] as const
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number]

export const PROVIDER_KEY_PATTERN = /^[a-z][a-z0-9_]*$/
export const providerKeySchema = z.string().regex(PROVIDER_KEY_PATTERN).max(50)

/** Hosted AI providers (kind `ai_provider`); `openai_compatible` also covers proxies with a base URL. */
export const AI_PROVIDER_KEYS = ['openai', 'anthropic', 'google', 'openai_compatible'] as const
export type AiProviderKey = (typeof AI_PROVIDER_KEYS)[number]

/** Servers on the customer's hardware (kind `local_server`). */
export const LOCAL_SERVER_PROVIDER_KEYS = [
  'ollama',
  'vllm',
  'llamacpp',
  'lmstudio',
  'openai_compatible',
] as const
export type LocalServerProviderKey = (typeof LOCAL_SERVER_PROVIDER_KEYS)[number]

/** Web search providers (kind `search_provider`, V1). */
export const SEARCH_PROVIDER_KEYS = ['searxng', 'brave', 'tavily'] as const
export type SearchProviderKey = (typeof SEARCH_PROVIDER_KEYS)[number]

/** Providers that are reached at a base URL: required for local servers, optional for proxies. */
export const BASE_URL_PROVIDER_KEYS = ['openai_compatible'] as const

export const secretSchema = z.string().trim().min(1).max(4096)

/** `http` or `https` only; local servers are usually plain `http://host:port`. */
export const baseUrlSchema = z.url({ protocol: /^https?$/ }).max(2048)

export const credentialNameSchema = z.string().trim().min(1).max(100)
