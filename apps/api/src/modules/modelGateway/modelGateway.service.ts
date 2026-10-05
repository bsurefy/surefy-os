// SPDX-License-Identifier: AGPL-3.0-only
import { embedMany, generateText, streamText } from 'ai'

import { providerErrorFrom, type AiProviderError } from '@/integrations/ai/index.js'
import type {
  ModelCallOutcome,
  ModelCallResultDto,
  ModelFallbackDto,
  ModelFallbackReason,
  ModelRefDto,
  VaultFallback,
} from '@surefy/contracts'

import { ModelProviderUnavailableError } from './modelGateway.errors.js'
import { costMicros, toUsageDto, type MeteredUsage } from './modelGateway.utils.js'
import { ModelResolver, type Unresolved } from './modelResolver.js'

import type {
  ModelCallContext,
  ModelCallGuard,
  ResolvedModel,
  UsageRecorder,
} from './modelGateway.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { VaultRepository } from '@/modules/vault/index.js'
import type { EmbeddingModelUsage, LanguageModelUsage } from 'ai'

type GenerateParams = Parameters<typeof generateText>[0]
type StreamParams = Parameters<typeof streamText>[0]
type StreamResult = ReturnType<typeof streamText>

/** A text call: everything the AI SDK takes except the model, which the gateway chooses. */
export type GatewayTextRequest = Omit<GenerateParams, 'model' | 'abortSignal'> & {
  modelKey: string
  signal?: AbortSignal
}

export type GatewayStreamRequest = Omit<
  StreamParams,
  'model' | 'abortSignal' | 'onFinish' | 'onAbort' | 'onError'
> & {
  modelKey: string
  signal?: AbortSignal
}

export interface GatewayTextResult {
  text: string
  /** The AI SDK's full answer: tool calls, steps, structured output. */
  response: Awaited<ReturnType<typeof generateText>>
  call: ModelCallResultDto
}

export interface GatewayStream {
  /** The AI SDK stream; read it (or `toUIMessageStream()`) from the start. */
  result: StreamResult
  model: ModelRefDto
  fallback: ModelFallbackDto | null
  /** Settles when the stream ends, is aborted or fails, after the call is metered. */
  call: Promise<ModelCallResultDto>
}

export interface GatewayEmbedResult {
  embeddings: number[][]
  call: ModelCallResultDto
}

export interface ModelGatewayDeps {
  db: Database
  resolver: ModelResolver
  fallbackOf: (orgId: string) => Promise<VaultFallback>
  vaultRepository: VaultRepository
  guards: () => readonly ModelCallGuard[]
  usage: UsageRecorder
  logger: Logger
  now?: () => number
}

const DEFAULT_RETRIES = 1
const LAST_USED_WRITE_MS = 5 * 60_000
const FIRST_PARTS = new Set([
  'text-delta',
  'reasoning-delta',
  'tool-call',
  'tool-input-start',
  'finish',
])

interface Attempt {
  resolved: ResolvedModel
  fallback: ModelFallbackDto | null
  /** 0 for the requested model, then one more per model tried. */
  index: number
  kind: 'generation' | 'embedding'
}

/**
 * The only caller of AI providers (integrations.md, "The model gateway"): access, guards, the
 * credential from Vault, the call through the AI SDK, fallback to the next allowed model when a
 * provider cannot serve, the key's health, and metering of every call, also on abort and failure.
 */
export class ModelGatewayService {
  private readonly now: () => number
  /** When `last_used_at` was last written per key: at most every 5 minutes. */
  private readonly lastUsedWrites = new Map<string, number>()

  constructor(private readonly deps: ModelGatewayDeps) {
    this.now = deps.now ?? Date.now
  }

  async generateText(
    ctx: ModelCallContext,
    request: GatewayTextRequest,
  ): Promise<GatewayTextResult> {
    const { modelKey, signal, ...params } = request
    const settings = await this.deps.fallbackOf(ctx.orgId)
    let lastFailure: AiProviderError | null = null
    for await (const attempt of this.attempts(ctx, modelKey, settings, 'language')) {
      if (lastFailure !== null && attempt.fallback !== null) {
        attempt.fallback.reason = fallbackReason(lastFailure)
      }
      const started = this.now()
      const timeout = timeoutSignal(settings)
      try {
        const response = await generateText({
          maxRetries: DEFAULT_RETRIES,
          ...(params as Omit<GenerateParams, 'model'>),
          model: requireLanguage(attempt.resolved),
          abortSignal: anySignal(signal, timeout),
        } as GenerateParams)
        const call = await this.finish(
          ctx,
          attempt,
          'success',
          usageOf(response.usage),
          started,
          null,
          null,
        )
        return { text: response.text, response, call }
      } catch (error) {
        if (signal?.aborted === true) {
          await this.finish(ctx, attempt, 'aborted', null, started, null, null)
          throw error
        }
        const failure = providerErrorFrom(error, timeout?.aborted === true)
        await this.finish(ctx, attempt, 'error', null, started, null, failure)
        if (failure === null) throw error
        lastFailure = failure
        if (!mayFallBack(failure, settings))
          throw new ModelProviderUnavailableError(failure.reasonCode)
      }
    }
    throw new ModelProviderUnavailableError(lastFailure?.reasonCode ?? null)
  }

  /**
   * Streams through the first model that starts answering: a provider that fails or times out
   * before its first token is replaced by the next allowed fallback model.
   */
  async streamText(ctx: ModelCallContext, request: GatewayStreamRequest): Promise<GatewayStream> {
    const { modelKey, signal, ...params } = request
    const settings = await this.deps.fallbackOf(ctx.orgId)
    let lastFailure: AiProviderError | null = null
    for await (const attempt of this.attempts(ctx, modelKey, settings, 'language')) {
      if (lastFailure !== null && attempt.fallback !== null) {
        attempt.fallback.reason = fallbackReason(lastFailure)
      }
      const started = this.now()
      const controller = new AbortController()
      const forward = () => {
        controller.abort(signal?.reason)
      }
      signal?.addEventListener('abort', forward, { once: true })
      let firstTokenAt: number | null = null
      let settle!: (call: ModelCallResultDto) => void
      const call = new Promise<ModelCallResultDto>((resolve) => {
        settle = resolve
      })
      const meter = (
        outcome: ModelCallOutcome,
        usage: MeteredUsage | null,
        failure: AiProviderError | null,
      ) =>
        this.finish(ctx, attempt, outcome, usage, started, firstTokenAt, failure).then(
          settle,
          (error: unknown) => {
            this.deps.logger.error({ err: error }, 'model call metering failed')
          },
        )
      const result = streamText({
        maxRetries: DEFAULT_RETRIES,
        ...(params as Omit<StreamParams, 'model'>),
        model: requireLanguage(attempt.resolved),
        abortSignal: controller.signal,
        onFinish: ({ usage }) => meter('success', usageOf(usage), null),
        onAbort: () => meter('aborted', null, null),
        // the reader gets the failure as an error part; the probe below handles it
        onError: ignore,
      } as StreamParams)

      const probe = await this.firstPart(result, settings, controller)
      if (probe.ok) {
        firstTokenAt = this.now()
        return { result, model: attempt.resolved.ref, fallback: attempt.fallback, call }
      }
      signal?.removeEventListener('abort', forward)
      if (signal?.aborted === true) {
        void meter('aborted', null, null)
        throw probe.error
      }
      const failure = providerErrorFrom(probe.error, probe.timedOut)
      void meter('error', null, failure)
      if (failure === null) throw probe.error
      lastFailure = failure
      if (!mayFallBack(failure, settings)) {
        throw new ModelProviderUnavailableError(failure.reasonCode)
      }
    }
    throw new ModelProviderUnavailableError(lastFailure?.reasonCode ?? null)
  }

  /** Embeddings with the given model; no fallback: a knowledge base keeps its embedding model. */
  async embedMany(
    ctx: ModelCallContext,
    request: { modelKey: string; values: string[]; signal?: AbortSignal },
  ): Promise<GatewayEmbedResult> {
    const resolved = await this.deps.resolver.resolve(ctx, request.modelKey, 'embedding')
    ModelResolver.assertAllowed(resolved)
    if ('reason' in resolved) throw new ModelProviderUnavailableError(null)
    const attempt: Attempt = { resolved, fallback: null, index: 0, kind: 'embedding' }
    await this.runGuards(ctx, attempt)
    const started = this.now()
    if (resolved.embeddingModel === undefined) throw new ModelProviderUnavailableError(null)
    try {
      const response = await embedMany({
        model: resolved.embeddingModel,
        values: request.values,
        maxRetries: DEFAULT_RETRIES,
        ...(request.signal === undefined ? {} : { abortSignal: request.signal }),
      })
      const call = await this.finish(
        ctx,
        attempt,
        'success',
        embeddingUsage(response.usage),
        started,
        null,
        null,
      )
      return { embeddings: response.embeddings, call }
    } catch (error) {
      const failure = providerErrorFrom(error)
      await this.finish(
        ctx,
        attempt,
        request.signal?.aborted === true ? 'aborted' : 'error',
        null,
        started,
        null,
        failure,
      )
      if (failure === null) throw error
      throw new ModelProviderUnavailableError(failure.reasonCode)
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  /**
   * The requested model, then the fallback order, each resolved when its turn comes; models the
   * caller may not use, and ones without a usable key or server, are skipped. Guards run before
   * each attempt; a blocked call is metered and its error thrown.
   */
  private async *attempts(
    ctx: ModelCallContext,
    modelKey: string,
    settings: VaultFallback,
    kind: 'language' | 'embedding',
  ): AsyncGenerator<Attempt> {
    const first = await this.deps.resolver.resolve(ctx, modelKey, kind)
    ModelResolver.assertAllowed(first)
    // no usable key or server for the requested model: only the fallback order can answer
    if (!isResolved(first) && !settings.onProviderError)
      throw new ModelProviderUnavailableError(null)
    const order = [modelKey, ...settings.order.filter((key) => key !== modelKey)]
    let requested: ModelRefDto | null = refOf(first)
    let tried = 0
    for (const [index, key] of order.entries()) {
      const resolved: ResolvedModel | Unresolved =
        index === 0 ? first : await this.deps.resolver.resolve(ctx, key, kind)
      if (!isResolved(resolved)) continue
      requested ??= resolved.ref
      const attempt: Attempt = {
        resolved,
        fallback:
          index === 0 ? null : { from: requested, to: resolved.ref, reason: 'provider_error' },
        index: tried++,
        kind: kind === 'embedding' ? 'embedding' : 'generation',
      }
      await this.runGuards(ctx, attempt)
      yield attempt
    }
  }

  private async runGuards(ctx: ModelCallContext, attempt: Attempt): Promise<void> {
    for (const guard of this.deps.guards()) {
      try {
        await guard.check(ctx, attempt.resolved.ref)
      } catch (error) {
        await this.finish(ctx, attempt, 'blocked', null, this.now(), null, null)
        throw error
      }
    }
  }

  /** Reads the stream until it starts answering, fails, or the first-token timeout passes. */
  private async firstPart(
    result: StreamResult,
    settings: VaultFallback,
    controller: AbortController,
  ): Promise<{ ok: true } | { ok: false; error: unknown; timedOut: boolean }> {
    const iterator = result.stream[Symbol.asyncIterator]()
    let timedOut = false
    const timer =
      settings.timeoutSeconds === null
        ? null
        : setTimeout(() => {
            timedOut = true
            controller.abort(new Error('first token timeout'))
          }, settings.timeoutSeconds * 1000)
    try {
      for (;;) {
        const next = await iterator.next()
        if (next.done === true) return { ok: true }
        if (next.value.type === 'error') return { ok: false, error: next.value.error, timedOut }
        if (next.value.type === 'abort') return { ok: false, error: new Error('aborted'), timedOut }
        if (FIRST_PARTS.has(next.value.type)) return { ok: true }
      }
    } catch (error) {
      return { ok: false, error, timedOut }
    } finally {
      if (timer !== null) clearTimeout(timer)
      // only this probe's branch of the stream: the caller's reads start from the beginning
      void iterator.return?.()
    }
  }

  /** Meters the call, records the key's health and last use, and returns the result DTO. */
  private async finish(
    ctx: ModelCallContext,
    attempt: Attempt,
    outcome: ModelCallOutcome,
    usage: MeteredUsage | null,
    started: number,
    firstTokenAt: number | null,
    failure: AiProviderError | null,
  ): Promise<ModelCallResultDto> {
    const { resolved } = attempt
    const metered = usage ?? { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }
    const result: ModelCallResultDto = {
      model: resolved.ref,
      credentialScope: resolved.credentialScope,
      outcome,
      routed: false,
      fallback: attempt.fallback,
      usage: toUsageDto(metered, costMicros(metered, resolved.prices), resolved.prices.currency, {
        firstTokenMs: firstTokenAt === null ? null : firstTokenAt - started,
        latencyMs: this.now() - started,
      }),
    }
    await this.recordHealth(ctx, resolved, outcome, failure)
    await this.deps.usage.record({
      ctx,
      result,
      kind: attempt.kind,
      attempt: attempt.index,
      startedAt: new Date(started),
      credentialId: resolved.credentialId,
      vaultModelId: resolved.vaultModelId ?? null,
      outcome,
      errorCode: failure?.reasonCode ?? null,
    })
    return result
  }

  /** 401/403 → error, 429 → rate limited, a success → active again; at most one write per call. */
  private async recordHealth(
    ctx: ModelCallContext,
    resolved: ResolvedModel,
    outcome: ModelCallOutcome,
    failure: AiProviderError | null,
  ): Promise<void> {
    const id = resolved.credentialId
    if (id === null) return
    const repository = this.deps.vaultRepository
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (outcome === 'success') {
        const row = await repository.findById(tx, ctx.orgId, id)
        if (row !== undefined && row.status !== 'active' && row.status !== 'revoked') {
          await repository.setStatus(tx, ctx.orgId, id, 'active', null, true)
        }
        const last = this.lastUsedWrites.get(id) ?? 0
        if (this.now() - last >= LAST_USED_WRITE_MS) {
          this.lastUsedWrites.set(id, this.now())
          await repository.touchLastUsed(tx, ctx.orgId, id)
        }
        return
      }
      if (failure === null || failure.reasonCode === 'VAULT_TEST_TIMEOUT') return
      if (failure.reasonCode === 'LOCAL_SERVER_UNREACHABLE' && resolved.credentialScope !== 'local')
        return
      const status = failure.reasonCode === 'VAULT_QUOTA_EXCEEDED' ? 'rate_limited' : 'error'
      await repository.setStatus(tx, ctx.orgId, id, status, failure.reasonCode, false)
    })
  }
}

const isResolved = (value: ResolvedModel | Unresolved): value is ResolvedModel =>
  !('reason' in value)

/** The model a candidate names, also when it cannot serve (no key left, server offline). */
function refOf(value: ResolvedModel | Unresolved): ModelRefDto | null {
  if (isResolved(value)) return value.ref
  return 'ref' in value ? (value.ref ?? null) : null
}

const ignore = (): void => undefined

function requireLanguage(resolved: ResolvedModel) {
  if (resolved.languageModel === undefined) throw new ModelProviderUnavailableError(null)
  return resolved.languageModel
}

function timeoutSignal(settings: VaultFallback): AbortSignal | undefined {
  return settings.timeoutSeconds === null
    ? undefined
    : AbortSignal.timeout(settings.timeoutSeconds * 1000)
}

function anySignal(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const present = signals.filter((s): s is AbortSignal => s !== undefined)
  if (present.length === 0) return undefined
  return present.length === 1 ? present[0] : AbortSignal.any(present)
}

/** Fall back on the first-token timeout, or on an outage when the settings say so. */
function mayFallBack(failure: AiProviderError, settings: VaultFallback): boolean {
  if (failure.reasonCode === 'VAULT_TEST_TIMEOUT') return settings.timeoutSeconds !== null
  return failure.isUnavailable && settings.onProviderError
}

const fallbackReason = (failure: AiProviderError): ModelFallbackReason =>
  failure.reasonCode === 'VAULT_TEST_TIMEOUT' ? 'timeout' : 'provider_error'

function usageOf(usage: LanguageModelUsage): MeteredUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
  }
}

const embeddingUsage = (usage: EmbeddingModelUsage): MeteredUsage => ({
  inputTokens: usage.tokens,
  outputTokens: 0,
  cachedInputTokens: 0,
})
