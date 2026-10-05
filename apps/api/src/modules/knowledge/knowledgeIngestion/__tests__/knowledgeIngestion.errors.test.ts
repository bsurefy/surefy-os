// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  MlInputError,
  MlTimeoutError,
  MlUnavailableError,
  MlUnsupportedFileError,
} from '@/integrations/ml/index.js'

import { classifyFailure, KnowledgeNoTextError } from '../knowledgeIngestion.errors.js'

describe('classifyFailure', () => {
  it('fails unsupported files and input errors at once, without a retry', () => {
    for (const error of [
      new MlUnsupportedFileError('x', 'ML_UNSUPPORTED_FILE'),
      new MlInputError('x', 'ML_VALIDATION_FAILED'),
      new KnowledgeNoTextError(),
    ]) {
      expect(classifyFailure(error)).toEqual({
        code: 'KNOWLEDGE_FILE_UNSUPPORTED',
        retryable: false,
        timeout: false,
      })
    }
  })

  it('retries a timeout once, flagged so the job can count it', () => {
    expect(classifyFailure(new MlTimeoutError('x', 'ML_TIMEOUT'))).toEqual({
      code: 'KNOWLEDGE_PROCESSING_TIMEOUT',
      retryable: true,
      timeout: true,
    })
  })

  it('retries outages and unknown errors with backoff, naming a download failure', () => {
    expect(classifyFailure(new MlUnavailableError('x', 'ML_BUSY'))).toMatchObject({
      code: 'KNOWLEDGE_PROCESSING_TIMEOUT',
      retryable: true,
      timeout: false,
    })
    expect(classifyFailure(new MlUnavailableError('x', 'ML_FILE_DOWNLOAD_FAILED')).code).toBe(
      'KNOWLEDGE_DOWNLOAD_FAILED',
    )
    expect(classifyFailure(new Error('provider down'))).toMatchObject({ retryable: true })
  })
})
