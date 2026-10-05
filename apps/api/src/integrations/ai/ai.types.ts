// SPDX-License-Identifier: AGPL-3.0-only
import type { ModelType } from '@surefy/contracts'

import type { EmbeddingModel, LanguageModel } from 'ai'

/** What a call needs to reach a provider or server; decrypted just in time, never cached. */
export interface AiProviderCredentials {
  /** Absent for local servers that need no key. */
  apiKey?: string
  /** The server address, or a proxy for a cloud provider. */
  baseUrl?: string
}

/** A model a provider or server lists. */
export interface DiscoveredModel {
  providerModelId: string
  displayName: string
  type: ModelType
}

export interface AiProviderCapabilities {
  chat: boolean
  embeddings: boolean
  vision: boolean
  tools: boolean
  /** Runs on the customer's hardware: nothing leaves the server. */
  local: boolean
}

/**
 * One provider or local server kind behind SurefyOS's own interface (integrations.md, §2). Vendor
 * SDKs and vendor error shapes stay inside the provider files.
 */
export interface AiProviderDefinition {
  key: string
  label: string
  capabilities: AiProviderCapabilities
  /** Local servers and proxies need an address; cloud providers have a default one. */
  requiresBaseUrl: boolean
  requiresApiKey: boolean
  createLanguageModel(credentials: AiProviderCredentials, modelId: string): LanguageModel
  createEmbeddingModel?(credentials: AiProviderCredentials, modelId: string): EmbeddingModel
  /** Lists the models; a passing call is also the connection test. Throws `AiProviderError`. */
  listModels(credentials: AiProviderCredentials, signal: AbortSignal): Promise<DiscoveredModel[]>
  /** The URL a connection test checks, shown for "Server offline". */
  checkedUrl(credentials: AiProviderCredentials): string
}
