// SPDX-License-Identifier: AGPL-3.0-only
import type { ModelType } from '@surefy/contracts'

/**
 * A model's metadata as SurefyOS ships it (ai-architecture.md, "Model catalog"): what Vault fills
 * in when a sync finds the model. Prices are per million tokens in micros; null when not set here,
 * which meters the call as 0 and flags it in Insights. Install-level overrides come in V1
 * (`model_catalog_overrides`).
 */
export interface CatalogEntry {
  providerKey: string
  providerModelId: string
  displayName: string
  type: ModelType
  contextWindow: number | null
  supportsVision: boolean
  supportsTools: boolean
  embeddingDimensions: number | null
  prices: {
    inputPerMTokMicros: number | null
    outputPerMTokMicros: number | null
    cachedInputPerMTokMicros: number | null
    currency: string
  }
}

const NO_PRICES = {
  inputPerMTokMicros: null,
  outputPerMTokMicros: null,
  cachedInputPerMTokMicros: null,
  currency: 'USD',
} as const

const chat = (
  providerKey: string,
  providerModelId: string,
  displayName: string,
  contextWindow: number | null,
): CatalogEntry => ({
  providerKey,
  providerModelId,
  displayName,
  type: 'chat',
  contextWindow,
  supportsVision: true,
  supportsTools: true,
  embeddingDimensions: null,
  prices: NO_PRICES,
})

const embedding = (
  providerKey: string,
  providerModelId: string,
  displayName: string,
  embeddingDimensions: number,
): CatalogEntry => ({
  providerKey,
  providerModelId,
  displayName,
  type: 'embedding',
  contextWindow: null,
  supportsVision: false,
  supportsTools: false,
  embeddingDimensions,
  prices: NO_PRICES,
})

/** Provider models in this list start enabled after a sync; anything else starts disabled. */
export const MODEL_CATALOG: readonly CatalogEntry[] = [
  chat('openai', 'gpt-4.1', 'GPT-4.1', 1_047_576),
  chat('openai', 'gpt-4.1-mini', 'GPT-4.1 mini', 1_047_576),
  chat('openai', 'gpt-4o', 'GPT-4o', 128_000),
  chat('openai', 'gpt-4o-mini', 'GPT-4o mini', 128_000),
  embedding('openai', 'text-embedding-3-small', 'Text Embedding 3 Small', 1536),
  embedding('openai', 'text-embedding-3-large', 'Text Embedding 3 Large', 3072),
  chat('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', null),
  chat('anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', null),
  chat('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', null),
  chat('google', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 1_048_576),
  chat('google', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 1_048_576),
  embedding('google', 'gemini-embedding-001', 'Gemini Embedding', 3072),
  embedding('google', 'text-embedding-004', 'Text Embedding 004', 768),
]

/** The catalog entry of a provider model, or undefined when SurefyOS ships none. */
export function catalogEntry(
  providerKey: string,
  providerModelId: string,
): CatalogEntry | undefined {
  return MODEL_CATALOG.find(
    (entry) => entry.providerKey === providerKey && entry.providerModelId === providerModelId,
  )
}

const EMBEDDING_HINT = /embed/i

/** A listed model's type: the catalog's, else a guess from its id. */
export const guessModelType = (providerKey: string, providerModelId: string): ModelType =>
  catalogEntry(providerKey, providerModelId)?.type ??
  (EMBEDDING_HINT.test(providerModelId) ? 'embedding' : 'chat')
