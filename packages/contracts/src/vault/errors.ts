// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the vault domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const VAULT_ERROR_CODES = {
  VAULT_KEY_INVALID: 'VAULT_KEY_INVALID', // 422: the provider rejected the key (401/403)
  VAULT_QUOTA_EXCEEDED: 'VAULT_QUOTA_EXCEEDED', // 422: the key has no quota left at the provider
  VAULT_REGION_BLOCKED: 'VAULT_REGION_BLOCKED', // 422: the provider does not serve this region
  VAULT_TEST_TIMEOUT: 'VAULT_TEST_TIMEOUT', // 422: no answer within the 20 s test window
  LOCAL_SERVER_UNREACHABLE: 'LOCAL_SERVER_UNREACHABLE', // 422: nothing answered at the base URL
  VAULT_CREDENTIAL_NOT_FOUND: 'VAULT_CREDENTIAL_NOT_FOUND', // 404
  VAULT_CREDENTIAL_REVOKED: 'VAULT_CREDENTIAL_REVOKED', // 409: a revoked key cannot change or be tested
  VAULT_PERSONAL_KEYS_DISABLED: 'VAULT_PERSONAL_KEYS_DISABLED', // 403: the access policy does not allow personal keys here
  VAULT_PROVIDER_NOT_ALLOWED: 'VAULT_PROVIDER_NOT_ALLOWED', // 403: the access policy excludes this provider or local models
  VAULT_ROTATION_MISMATCH: 'VAULT_ROTATION_MISMATCH', // 422: a replacement must keep the provider and scope of the key it replaces
  VAULT_SERVER_IN_USE: 'VAULT_SERVER_IN_USE', // 409: a model of the server is the embedding model or backs a decision model
} as const
