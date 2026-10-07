// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

// Model keys: the stable text every other table stores to name a model (agents, flows, chats, usage,
// knowledge bases; database/vault-and-models.md §3 "model_key format").

export const MODEL_TYPES = ['chat', 'embedding', 'decision'] as const
export type ModelType = (typeof MODEL_TYPES)[number]

/** Where a stored model comes from: a hosted provider, a local server or a trained model (V3). */
export const VAULT_MODEL_SOURCES = ['provider', 'local', 'trained'] as const
export type VaultModelSource = (typeof VAULT_MODEL_SOURCES)[number]

/** Sources a person can pick from: the stored ones plus Cloud platform models (served by the Cloud source). */
export const MODEL_PICKER_SOURCES = [...VAULT_MODEL_SOURCES, 'platform'] as const
export type ModelPickerSource = (typeof MODEL_PICKER_SOURCES)[number]

/** `available ⇄ unavailable`; `→ removed_upstream` when a sync no longer lists the model. */
export const VAULT_MODEL_STATUSES = ['available', 'unavailable', 'removed_upstream'] as const
export type VaultModelStatus = (typeof VAULT_MODEL_STATUSES)[number]

/** Dimensions `knowledge_chunks` can index; an embedding model must produce one of them. */
export const EMBEDDING_DIMENSIONS = [384, 768, 1024, 1536, 3072] as const

/** The model every caller may ask for: the routing policy picks the actual model per call (V2). */
export const AUTO_MODEL_KEY = 'auto'
export const PLATFORM_MODEL_PREFIX = 'platform/'

export const modelKeySchema = z.string().min(1).max(300)

export const providerModelKey = (providerKey: string, providerModelId: string) =>
  `${providerKey}/${providerModelId}`

export const localModelKey = (credentialId: string, providerModelId: string) =>
  `local/${credentialId}/${providerModelId}`

export const trainedModelKey = (trainedModelId: string) => `trained/${trainedModelId}`

export type ParsedModelKey =
  | { source: 'auto' }
  | { source: 'provider'; providerKey: string; providerModelId: string }
  | { source: 'local'; credentialId: string; providerModelId: string }
  | { source: 'trained'; trainedModelId: string }
  | { source: 'platform'; platformModelId: string }

/**
 * Splits a model key into its parts, or returns null for text that is not a model key. Provider
 * model ids may contain `/` (`meta-llama/Llama-3`), so only the leading segments are split off.
 */
export function parseModelKey(key: string): ParsedModelKey | null {
  if (key === AUTO_MODEL_KEY) return { source: 'auto' }
  const first = key.indexOf('/')
  if (first <= 0 || first === key.length - 1) return null
  const head = key.slice(0, first)
  const rest = key.slice(first + 1)
  if (head === 'trained') return { source: 'trained', trainedModelId: rest }
  if (head === 'platform') return { source: 'platform', platformModelId: rest }
  if (head === 'local') {
    const second = rest.indexOf('/')
    if (second <= 0 || second === rest.length - 1) return null
    return {
      source: 'local',
      credentialId: rest.slice(0, second),
      providerModelId: rest.slice(second + 1),
    }
  }
  return { source: 'provider', providerKey: head, providerModelId: rest }
}
