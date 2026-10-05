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
  prices: CatalogPrices
}

export interface CatalogPrices {
  inputPerMTokMicros: number | null
  outputPerMTokMicros: number | null
  cachedInputPerMTokMicros: number | null
  currency: string
  /** The day the prices were read from the provider's official price list; null when unpriced. */
  checkedOn: string | null
}

/**
 * The official price lists, read on `PRICES_CHECKED_ON` (standard tier: no batch, priority or
 * regional surcharges):
 * - OpenAI: https://developers.openai.com/api/docs/pricing
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 * - Google: https://ai.google.dev/gemini-api/docs/pricing
 */
const PRICES_CHECKED_ON = '2026-10-05'

const MICROS_PER_DOLLAR = 1_000_000

/** Dollars per million tokens: input, output and cached input (null when the provider has none). */
const usd = (input: number, output: number | null, cachedInput: number | null): CatalogPrices => ({
  inputPerMTokMicros: Math.round(input * MICROS_PER_DOLLAR),
  outputPerMTokMicros: output === null ? null : Math.round(output * MICROS_PER_DOLLAR),
  cachedInputPerMTokMicros:
    cachedInput === null ? null : Math.round(cachedInput * MICROS_PER_DOLLAR),
  currency: 'USD',
  checkedOn: PRICES_CHECKED_ON,
})

/** Not on the provider's price list when checked: the call meters as 0 and Insights flags it. */
const NO_PRICES: CatalogPrices = {
  inputPerMTokMicros: null,
  outputPerMTokMicros: null,
  cachedInputPerMTokMicros: null,
  currency: 'USD',
  checkedOn: null,
}

const chat = (
  providerKey: string,
  providerModelId: string,
  displayName: string,
  contextWindow: number | null,
  prices: CatalogPrices,
): CatalogEntry => ({
  providerKey,
  providerModelId,
  displayName,
  type: 'chat',
  contextWindow,
  supportsVision: true,
  supportsTools: true,
  embeddingDimensions: null,
  prices,
})

const embedding = (
  providerKey: string,
  providerModelId: string,
  displayName: string,
  embeddingDimensions: number,
  prices: CatalogPrices,
): CatalogEntry => ({
  providerKey,
  providerModelId,
  displayName,
  type: 'embedding',
  contextWindow: null,
  supportsVision: false,
  supportsTools: false,
  embeddingDimensions,
  prices,
})

/** Provider models in this list start enabled after a sync; anything else starts disabled. */
export const MODEL_CATALOG: readonly CatalogEntry[] = [
  chat('openai', 'gpt-4.1', 'GPT-4.1', 1_047_576, usd(2, 8, 0.5)),
  chat('openai', 'gpt-4.1-mini', 'GPT-4.1 mini', 1_047_576, usd(0.4, 1.6, 0.1)),
  chat('openai', 'gpt-4o', 'GPT-4o', 128_000, usd(2.5, 10, 1.25)),
  chat('openai', 'gpt-4o-mini', 'GPT-4o mini', 128_000, usd(0.15, 0.6, 0.075)),
  embedding(
    'openai',
    'text-embedding-3-small',
    'Text Embedding 3 Small',
    1536,
    usd(0.02, null, null),
  ),
  embedding(
    'openai',
    'text-embedding-3-large',
    'Text Embedding 3 Large',
    3072,
    usd(0.13, null, null),
  ),
  // cached input is the price of a cache hit; cache writes cost more and are not metered apart
  chat('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', 1_000_000, usd(4, 20, 0.2)),
  chat('anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 1_000_000, usd(2, 10, 0.2)),
  chat('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 200_000, usd(1, 5, 0.1)),
  // prompts over 200k tokens cost more ($2.50 in, $15 out, $0.25 cached): the lower tier is metered
  chat('google', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 1_048_576, usd(1.25, 10, 0.125)),
  chat('google', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 1_048_576, usd(0.3, 2.5, 0.03)),
  embedding('google', 'gemini-embedding-2', 'Gemini Embedding 2', 3072, usd(0.2, null, null)),
  embedding('google', 'gemini-embedding-001', 'Gemini Embedding', 3072, NO_PRICES),
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
