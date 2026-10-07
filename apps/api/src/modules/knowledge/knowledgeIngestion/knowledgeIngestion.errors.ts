// SPDX-License-Identifier: AGPL-3.0-only
import {
  MlInputError,
  MlTimeoutError,
  MlUnavailableError,
  MlUnsupportedFileError,
} from '@/integrations/ml/index.js'
import { KNOWLEDGE_ERROR_CODES, type KNOWLEDGE_FAILURE_CODES } from '@surefy/contracts'

export type KnowledgeFailureCode = (typeof KNOWLEDGE_FAILURE_CODES)[number]

/** How a failed attempt goes on (background-jobs.md, the ingestion example). */
export interface Failure {
  /** The code the document shows when this is its last attempt. */
  code: KnowledgeFailureCode
  /** False: the document fails now (unsupported files, bad input). */
  retryable: boolean
  /** A timeout is retried once only; a second one is final. */
  timeout: boolean
}

/** A document with nothing to embed (a scan without text, an empty page). */
export class KnowledgeNoTextError extends Error {
  constructor() {
    super('the document has no text to index')
  }
}

export function classifyFailure(error: unknown): Failure {
  if (error instanceof MlUnsupportedFileError || error instanceof MlInputError) {
    return {
      code: KNOWLEDGE_ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED,
      retryable: false,
      timeout: false,
    }
  }
  if (error instanceof KnowledgeNoTextError) {
    return {
      code: KNOWLEDGE_ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED,
      retryable: false,
      timeout: false,
    }
  }
  if (error instanceof MlTimeoutError) {
    return {
      code: KNOWLEDGE_ERROR_CODES.KNOWLEDGE_PROCESSING_TIMEOUT,
      retryable: true,
      timeout: true,
    }
  }
  if (error instanceof MlUnavailableError && error.mlCode === 'ML_FILE_DOWNLOAD_FAILED') {
    return {
      code: KNOWLEDGE_ERROR_CODES.KNOWLEDGE_DOWNLOAD_FAILED,
      retryable: true,
      timeout: false,
    }
  }
  // the ML service busy or down, a provider outage, a model change underfoot: retry with backoff
  return {
    code: KNOWLEDGE_ERROR_CODES.KNOWLEDGE_PROCESSING_TIMEOUT,
    retryable: true,
    timeout: false,
  }
}
