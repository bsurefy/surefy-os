// SPDX-License-Identifier: AGPL-3.0-only
import { createMlClient, mlErrorCode, ML_RETRYABLE_CODES } from '@surefy/ml-client'
import type { MlClient } from '@surefy/ml-client'

import {
  MlInputError,
  MlTimeoutError,
  MlUnavailableError,
  MlUnsupportedFileError,
} from './ml.errors.js'

import type { MlError } from './ml.errors.js'
import type {
  DetectPiiResponse,
  MaskPiiResponse,
  MlService,
  ParsedDocument,
  ParseDocumentInput,
  PiiInput,
} from './ml.types.js'

export interface MlServiceOptions {
  baseUrl: string
  serviceToken: string
  /** Parsing a large PDF can take minutes, so it runs only from jobs. */
  parseTimeoutMs?: number
  /** Personal-data calls sit in the path of a model call or a search, so they are short. */
  piiTimeoutMs?: number
  fetch?: typeof globalThis.fetch
}

const DEFAULT_PARSE_TIMEOUT_MS = 5 * 60_000
const DEFAULT_PII_TIMEOUT_MS = 15_000

/** The adapter over the generated client: our errors in, no vendor shapes out. */
export class HttpMlService implements MlService {
  private readonly client: MlClient
  private readonly parseTimeoutMs: number
  private readonly piiTimeoutMs: number

  constructor(options: MlServiceOptions) {
    this.client = createMlClient({
      baseUrl: options.baseUrl,
      serviceToken: options.serviceToken,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
    this.parseTimeoutMs = options.parseTimeoutMs ?? DEFAULT_PARSE_TIMEOUT_MS
    this.piiTimeoutMs = options.piiTimeoutMs ?? DEFAULT_PII_TIMEOUT_MS
  }

  async parseDocument(input: ParseDocumentInput, signal?: AbortSignal): Promise<ParsedDocument> {
    const timeout = AbortSignal.timeout(this.parseTimeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    // typed through the call itself: `MlClient['POST']` covers every endpoint of the service
    const parse = () =>
      this.client.POST('/v1/documents/parse', {
        body: {
          fileUrl: input.fileUrl,
          mimeType: input.mimeType,
          orgId: input.orgId,
          ocr: input.ocr,
        },
        headers: input.requestId === undefined ? {} : { 'x-request-id': input.requestId },
        signal: combined,
      })
    let result: Awaited<ReturnType<typeof parse>>
    try {
      result = await parse()
    } catch (error) {
      if (timeout.aborted) throw new MlTimeoutError('the parse took too long', 'ML_TIMEOUT')
      if (signal?.aborted) throw error
      throw new MlUnavailableError('the ML service is unreachable', 'ML_INTERNAL_ERROR', {
        cause: error,
      })
    }
    if (result.data !== undefined) return result.data
    throw translate(result.error)
  }

  async detectPii(input: PiiInput, signal?: AbortSignal): Promise<DetectPiiResponse> {
    const { combined, timeout } = this.piiSignal(signal)
    const detect = () =>
      this.client.POST('/v1/pii/detect', {
        body: piiBody(input),
        headers: input.requestId === undefined ? {} : { 'x-request-id': input.requestId },
        signal: combined,
      })
    let result: Awaited<ReturnType<typeof detect>>
    try {
      result = await detect()
    } catch (error) {
      throw unreachable(error, timeout, signal)
    }
    if (result.data !== undefined) return result.data
    throw translate(result.error, 'the personal-data check took too long')
  }

  async maskPii(input: PiiInput, signal?: AbortSignal): Promise<MaskPiiResponse> {
    const { combined, timeout } = this.piiSignal(signal)
    const mask = () =>
      this.client.POST('/v1/pii/mask', {
        body: piiBody(input),
        headers: input.requestId === undefined ? {} : { 'x-request-id': input.requestId },
        signal: combined,
      })
    let result: Awaited<ReturnType<typeof mask>>
    try {
      result = await mask()
    } catch (error) {
      throw unreachable(error, timeout, signal)
    }
    if (result.data !== undefined) return result.data
    throw translate(result.error, 'the personal-data check took too long')
  }

  private piiSignal(signal: AbortSignal | undefined) {
    const timeout = AbortSignal.timeout(this.piiTimeoutMs)
    return { timeout, combined: signal ? AbortSignal.any([signal, timeout]) : timeout }
  }
}

const piiBody = (input: PiiInput) => ({
  orgId: input.orgId,
  texts: [...input.texts],
  ...(input.locale === undefined ? {} : { locale: input.locale }),
  ...(input.types === undefined ? {} : { types: input.types }),
  ...(input.customPatterns === undefined ? {} : { customPatterns: input.customPatterns }),
})

/** A thrown failure of a personal-data call: aborted by the caller, timed out, or unreachable. */
function unreachable(error: unknown, timeout: AbortSignal, signal: AbortSignal | undefined) {
  if (timeout.aborted) {
    return new MlTimeoutError('the personal-data check took too long', 'ML_TIMEOUT')
  }
  if (signal?.aborted) return error
  return new MlUnavailableError('the ML service is unreachable', 'ML_INTERNAL_ERROR', {
    cause: error,
  })
}

function translate(body: unknown, timeoutMessage = 'the parse took too long'): MlError {
  const code = mlErrorCode(body)
  if (code === 'ML_TIMEOUT') return new MlTimeoutError(timeoutMessage, code)
  if (code === 'ML_UNSUPPORTED_FILE') {
    return new MlUnsupportedFileError('the file type cannot be parsed', code)
  }
  if (ML_RETRYABLE_CODES.has(code)) return new MlUnavailableError(`ML service: ${code}`, code)
  return new MlInputError(`ML service rejected the request: ${code}`, code)
}
