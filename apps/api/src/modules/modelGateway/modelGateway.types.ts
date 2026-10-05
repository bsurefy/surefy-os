// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ModelCallCredentialScope,
  ModelCallOutcome,
  ModelCallResultDto,
  ModelRefDto,
} from '@surefy/contracts'

import type { EmbeddingModel, LanguageModel } from 'ai'

/** Who asks for a model call, and in which setting (integrations.md, "The model gateway"). */
export interface ModelCallContext {
  orgId: string
  /** null for a flow or a system job without a person. */
  userId: string | null
  teamIds: readonly string[]
  primaryTeamId: string | null
  /** From effective access; `'all'` only for system contexts. */
  allowedModelIds: readonly string[] | 'all'
  /** Personal keys serve only a person's own chats; agents and flows never use them. */
  caller: 'chat' | 'agent' | 'flow' | 'knowledge' | 'system'
  /** Private chats only ever use local models. */
  isPrivateChat?: boolean
  requestId?: string
}

/** The model that serves a call, ready for the AI SDK. */
export interface ResolvedModel {
  ref: ModelRefDto
  credentialScope: ModelCallCredentialScope
  /** The key or server used; null for an extension's source. */
  credentialId: string | null
  /** Per million tokens, micros of `currency`; null = unknown (metered as 0). */
  prices: {
    input: number | null
    output: number | null
    cachedInput: number | null
    currency: string
  }
  languageModel?: LanguageModel
  embeddingModel?: EmbeddingModel
}

/**
 * A source of models outside Vault, for keys with its prefix (Cloud's `platform/` models). It
 * resolves a model for a call; access and metering stay the gateway's.
 */
export interface ModelSource {
  prefix: string
  resolve(ctx: ModelCallContext, modelKey: string): Promise<ResolvedModel | null>
}

/**
 * Runs before every call; throws to block it (a budget reached, Cloud's credit balance → 402).
 * A blocked call is metered with outcome `blocked`.
 */
export interface ModelCallGuard {
  name: string
  check(ctx: ModelCallContext, model: ModelRefDto): Promise<void>
}

/** One metered call, also on abort and failure. */
export interface ModelCallRecord {
  ctx: ModelCallContext
  result: ModelCallResultDto
  credentialId: string | null
  outcome: ModelCallOutcome
  errorCode: string | null
}

/** Usage metering (the usage module); until it lands, calls are written to the log. */
export interface UsageRecorder {
  record(record: ModelCallRecord): Promise<void>
}
