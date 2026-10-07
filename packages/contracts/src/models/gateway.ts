// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { MODEL_PICKER_SOURCES, modelKeySchema } from './keys.js'

// The model gateway's public types: what chat, agents, knowledge and usage see of a model call
// (backend/integrations.md "The model gateway", database/usage-budgets-and-audit.md §1).

/** Recorded also on abort and failure. */
export const MODEL_CALL_OUTCOMES = ['success', 'error', 'aborted', 'blocked'] as const
export type ModelCallOutcome = (typeof MODEL_CALL_OUTCOMES)[number]

/** Whose credential, or which source, served a call. */
export const MODEL_CALL_CREDENTIAL_SCOPES = [
  'organization',
  'team',
  'personal',
  'local',
  'platform',
] as const
export type ModelCallCredentialScope = (typeof MODEL_CALL_CREDENTIAL_SCOPES)[number]

/** Why the gateway replaced the requested model with the next one in the fallback order. */
export const MODEL_FALLBACK_REASONS = ['provider_error', 'timeout', 'budget'] as const
export type ModelFallbackReason = (typeof MODEL_FALLBACK_REASONS)[number]

/** A model as other DTOs embed it (a chat message, an agent, a usage row). */
export const modelRefDtoSchema = z.object({
  modelKey: modelKeySchema,
  displayName: z.string(),
  providerKey: z.string(),
  source: z.enum(MODEL_PICKER_SOURCES),
})
export type ModelRefDto = z.infer<typeof modelRefDtoSchema>

/** Metered size of one call. Money is integer micros of `currency`; unknown prices meter as 0. */
export const modelUsageDtoSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  currency: z.string().length(3),
  /** Time to the first token; null for calls that do not stream. */
  firstTokenMs: z.number().int().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative(),
})
export type ModelUsageDto = z.infer<typeof modelUsageDtoSchema>

/** Set on a response when the requested model was replaced: "Answered by {to} · fallback in use". */
export const modelFallbackDtoSchema = z.object({
  from: modelRefDtoSchema,
  to: modelRefDtoSchema,
  reason: z.enum(MODEL_FALLBACK_REASONS),
})
export type ModelFallbackDto = z.infer<typeof modelFallbackDtoSchema>

/** What actually served a call, returned with a finished response and recorded in usage. */
export const modelCallResultDtoSchema = z.object({
  model: modelRefDtoSchema,
  credentialScope: z.enum(MODEL_CALL_CREDENTIAL_SCOPES),
  outcome: z.enum(MODEL_CALL_OUTCOMES),
  /** The model was chosen by a routing policy (`auto`, V2). */
  routed: z.boolean(),
  fallback: modelFallbackDtoSchema.nullable(),
  usage: modelUsageDtoSchema,
})
export type ModelCallResultDto = z.infer<typeof modelCallResultDtoSchema>
