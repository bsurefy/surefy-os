// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the models domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const MODELS_ERROR_CODES = {
  MODEL_NOT_ALLOWED: 'MODEL_NOT_ALLOWED',
  MODEL_PROVIDER_UNAVAILABLE: 'MODEL_PROVIDER_UNAVAILABLE',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND', // 404
  MODEL_EMBEDDING_INVALID: 'MODEL_EMBEDDING_INVALID', // 422: the embedding model must be an enabled embedding model
} as const
