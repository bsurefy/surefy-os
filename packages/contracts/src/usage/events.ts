// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { MODEL_CALL_CREDENTIAL_SCOPES, MODEL_CALL_OUTCOMES } from '../models/gateway.js'
import { modelKeySchema } from '../models/keys.js'
import { currencySchema } from '../organizations/schemas.js'

// One metered call (database/usage-budgets-and-audit.md §1): what `modelGateway` (and `train` and
// search for their own units) hands the `usage` meter, and what the `usage.recorded` domain event
// carries. Never returned row by row over HTTP; Insights reads the daily and monthly rollups.

/** The module the call was made for. */
export const USAGE_SOURCE_MODULES = [
  'chat',
  'agent',
  'flow',
  'knowledge',
  'decision',
  'routing',
  'train',
  'search',
] as const
export type UsageSourceModule = (typeof USAGE_SOURCE_MODULES)[number]

export const USAGE_KINDS = [
  'generation',
  'embedding',
  'decision',
  'web_search',
  'speech',
  'training',
] as const
export type UsageKind = (typeof USAGE_KINDS)[number]

/** The agent or flow a call ran for. */
export const USAGE_SUBJECT_TYPES = ['agent', 'flow'] as const
export type UsageSubjectType = (typeof USAGE_SUBJECT_TYPES)[number]

/** `local` ⇔ credential scope `local`; `platform_credits` ⇔ credential scope `platform`. */
export const USAGE_BILLED_VIA = ['provider_direct', 'local', 'platform_credits'] as const
export type UsageBilledVia = (typeof USAGE_BILLED_VIA)[number]

export const USAGE_DATA_LOCATIONS = ['local', 'provider', 'platform'] as const
export type UsageDataLocation = (typeof USAGE_DATA_LOCATIONS)[number]

const countSchema = z.number().int().nonnegative()

/**
 * A call to meter. `dedupeKey` is deterministic per call (`chat:{messageId}:{n}`,
 * `agent_run:{runId}:{seq}`, `knowledge:{documentId}:{batch}`…) and `occurredAt` is the call start,
 * reused on retries, so a retried meter records nothing twice. `teamId` is the person's primary
 * team at event time; calls without a person (API keys, channels, flow triggers) have neither.
 */
export const usageEventSchema = z
  .object({
    userId: z.uuid().nullable(),
    teamId: z.uuid().nullable(),
    apiKeyId: z.uuid().nullable(),
    sourceModule: z.enum(USAGE_SOURCE_MODULES),
    subjectType: z.enum(USAGE_SUBJECT_TYPES).nullable(),
    subjectId: z.uuid().nullable(),
    /** Chat message, run, document or training job id; Insights never opens it. */
    sourceRefId: z.uuid().nullable(),
    kind: z.enum(USAGE_KINDS),
    /** Vault model key, `platform/…` model key, or `search/{provider}` for web searches. */
    modelKey: modelKeySchema,
    vaultModelId: z.uuid().nullable(),
    credentialId: z.uuid().nullable(),
    credentialScope: z.enum(MODEL_CALL_CREDENTIAL_SCOPES),
    providerKey: z.string().min(1).max(100),
    inputTokens: countSchema,
    outputTokens: countSchema,
    cachedInputTokens: countSchema,
    reasoningTokens: countSchema,
    /** Non-token units by `kind`: searches for `web_search`, seconds for `speech` and `training`. */
    units: countSchema,
    /** Integer micros of `currency`; 0 for local models and for models without a known price. */
    costMicros: countSchema,
    currency: currencySchema,
    billedVia: z.enum(USAGE_BILLED_VIA),
    latencyMs: countSchema.nullable(),
    outcome: z.enum(MODEL_CALL_OUTCOMES),
    errorCode: z.string().min(1).max(100).nullable(),
    /** The model was chosen by a routing policy (`auto`). */
    routed: z.boolean(),
    /** Set when the fallback order replaced the requested model. */
    fallbackFromModelKey: modelKeySchema.nullable(),
    /** The personal-data filter changed the request. */
    piiMasked: z.boolean(),
    dataLocation: z.enum(USAGE_DATA_LOCATIONS),
    dedupeKey: z.string().min(1).max(300),
    /** HTTP request or job id, for tracing. */
    requestId: z.string().min(1).max(200).nullable(),
    occurredAt: z.iso.datetime(),
  })
  .refine((event) => (event.subjectType === null) === (event.subjectId === null), {
    message: 'subjectType and subjectId are set together',
    path: ['subjectId'],
  })
  .refine(
    (event) =>
      (event.billedVia === 'local') === (event.credentialScope === 'local') &&
      (event.billedVia === 'platform_credits') === (event.credentialScope === 'platform'),
    { message: 'billedVia does not match credentialScope', path: ['billedVia'] },
  )
export type UsageEvent = z.infer<typeof usageEventSchema>
