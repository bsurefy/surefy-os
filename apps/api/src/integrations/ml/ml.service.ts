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
import type { MlService, ParsedDocument, ParseDocumentInput } from './ml.types.js'

export interface MlServiceOptions {
  baseUrl: string
  serviceToken: string
  /** Parsing a large PDF can take minutes, so it runs only from jobs. */
  parseTimeoutMs?: number
  fetch?: typeof globalThis.fetch
}

const DEFAULT_PARSE_TIMEOUT_MS = 5 * 60_000

/** The adapter over the generated client: our errors in, no vendor shapes out. */
export class HttpMlService implements MlService {
  private readonly client: MlClient
  private readonly parseTimeoutMs: number

  constructor(options: MlServiceOptions) {
    this.client = createMlClient({
      baseUrl: options.baseUrl,
      serviceToken: options.serviceToken,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
    this.parseTimeoutMs = options.parseTimeoutMs ?? DEFAULT_PARSE_TIMEOUT_MS
  }

  async parseDocument(input: ParseDocumentInput, signal?: AbortSignal): Promise<ParsedDocument> {
    const timeout = AbortSignal.timeout(this.parseTimeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let result: Awaited<ReturnType<MlClient['POST']>>
    try {
      result = await this.client.POST('/v1/documents/parse', {
        body: {
          fileUrl: input.fileUrl,
          mimeType: input.mimeType,
          orgId: input.orgId,
          ocr: input.ocr,
        },
        headers: input.requestId === undefined ? {} : { 'x-request-id': input.requestId },
        signal: combined,
      })
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
}

function translate(body: unknown): MlError {
  const code = mlErrorCode(body)
  if (code === 'ML_TIMEOUT') return new MlTimeoutError('the parse took too long', code)
  if (code === 'ML_UNSUPPORTED_FILE') {
    return new MlUnsupportedFileError('the file type cannot be parsed', code)
  }
  if (ML_RETRYABLE_CODES.has(code)) return new MlUnavailableError(`ML service: ${code}`, code)
  return new MlInputError(`ML service rejected the request: ${code}`, code)
}
