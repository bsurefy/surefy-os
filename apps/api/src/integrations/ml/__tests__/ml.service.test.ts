// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  HttpMlService,
  MlInputError,
  MlTimeoutError,
  MlUnavailableError,
  MlUnsupportedFileError,
} from '../index.js'

const input = {
  fileUrl: 'https://files.test/a.pdf?sig=1',
  mimeType: 'application/pdf',
  orgId: '0198c2b4-0000-7000-8000-000000000001',
  ocr: 'auto' as const,
  requestId: 'req-1',
}

const parsed = {
  title: 'Handbook',
  language: 'en',
  pages: 2,
  sections: [{ headingPath: ['Leave'], text: 'Twenty days.', pageFrom: 1, pageTo: 1 }],
  tables: [],
  usedOcr: false,
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const failure = (code: string) => json(422, { error: { code, message: 'x', requestId: 'r' } })

const service = (fetch: typeof globalThis.fetch) =>
  new HttpMlService({ baseUrl: 'https://ml.test/', serviceToken: 't'.repeat(32), fetch })

describe('HttpMlService.parseDocument', () => {
  it('sends the token, request id and file URL and returns the parsed document', async () => {
    let seen: Request | undefined
    const ml = service((request) => {
      seen = request as Request
      return Promise.resolve(json(200, parsed))
    })
    await expect(ml.parseDocument(input)).resolves.toEqual(parsed)
    expect(seen?.url).toBe('https://ml.test/v1/documents/parse')
    expect(seen?.headers.get('authorization')).toBe(`Bearer ${'t'.repeat(32)}`)
    expect(seen?.headers.get('x-request-id')).toBe('req-1')
    expect(await seen?.json()).toEqual({
      fileUrl: input.fileUrl,
      mimeType: input.mimeType,
      orgId: input.orgId,
      ocr: 'auto',
    })
  })

  it.each([
    ['ML_UNSUPPORTED_FILE', MlUnsupportedFileError],
    ['ML_TIMEOUT', MlTimeoutError],
    ['ML_BUSY', MlUnavailableError],
    ['ML_FILE_DOWNLOAD_FAILED', MlUnavailableError],
    ['ML_NOT_READY', MlUnavailableError],
    ['ML_INTERNAL_ERROR', MlUnavailableError],
    ['ML_VALIDATION_FAILED', MlInputError],
    ['ML_FILE_TOO_LARGE', MlInputError],
    ['ML_UNAUTHORIZED', MlInputError],
  ])('maps %s to %s', async (code, errorClass) => {
    const ml = service(() => Promise.resolve(failure(code)))
    const error = await ml.parseDocument(input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(errorClass)
    expect((error as { mlCode: string }).mlCode).toBe(code)
  })

  it('treats an unknown code as a retryable internal error', async () => {
    const ml = service(() => Promise.resolve(failure('SOMETHING_NEW')))
    await expect(ml.parseDocument(input)).rejects.toBeInstanceOf(MlUnavailableError)
  })

  it('treats a network failure as unavailable', async () => {
    const ml = service(() => Promise.reject(new TypeError('fetch failed')))
    await expect(ml.parseDocument(input)).rejects.toBeInstanceOf(MlUnavailableError)
  })

  it('maps its own timeout to a timeout error', async () => {
    const ml = new HttpMlService({
      baseUrl: 'https://ml.test',
      serviceToken: 't'.repeat(32),
      parseTimeoutMs: 20,
      fetch: (request) =>
        new Promise((_resolve, reject) => {
          ;(request as Request).signal.addEventListener('abort', () => {
            reject(new Error('aborted'))
          })
        }),
    })
    await expect(ml.parseDocument(input)).rejects.toBeInstanceOf(MlTimeoutError)
  })
})

describe('HttpMlService personal data', () => {
  const request = {
    orgId: input.orgId,
    texts: ['Write to ana@acme.test', 'Nothing here'],
    types: ['email' as const],
    customPatterns: [{ label: 'Employee ID', pattern: 'EMP-\\d{6}' }],
    requestId: 'req-2',
  }

  it('sends the texts, the types and the custom patterns to /v1/pii/detect', async () => {
    const answer = {
      language: 'en',
      results: [
        { findings: [{ type: 'email', customLabel: null, start: 9, end: 22, score: 0.9 }] },
        { findings: [] },
      ],
    }
    let seen: Request | undefined
    const ml = service((req) => {
      seen = req as Request
      return Promise.resolve(json(200, answer))
    })
    await expect(ml.detectPii(request)).resolves.toEqual(answer)
    expect(seen?.url).toBe('https://ml.test/v1/pii/detect')
    expect(seen?.headers.get('authorization')).toBe(`Bearer ${'t'.repeat(32)}`)
    expect(seen?.headers.get('x-request-id')).toBe('req-2')
    expect(await seen?.json()).toEqual({
      orgId: input.orgId,
      texts: request.texts,
      types: ['email'],
      customPatterns: request.customPatterns,
    })
  })

  it('masks through /v1/pii/mask and leaves out what the caller did not set', async () => {
    const answer = { language: 'en', results: [{ text: 'Write to [EMAIL]', findings: [] }] }
    let seen: Request | undefined
    const ml = service((req) => {
      seen = req as Request
      return Promise.resolve(json(200, answer))
    })
    await expect(ml.maskPii({ orgId: input.orgId, texts: ['x'] })).resolves.toEqual(answer)
    expect(seen?.url).toBe('https://ml.test/v1/pii/mask')
    expect(await seen?.json()).toEqual({ orgId: input.orgId, texts: ['x'] })
  })

  it.each([
    ['ML_VALIDATION_FAILED', MlInputError],
    ['ML_TIMEOUT', MlTimeoutError],
    ['ML_BUSY', MlUnavailableError],
  ])('maps %s to a typed error', async (code, errorClass) => {
    const ml = service(() => Promise.resolve(failure(code)))
    await expect(ml.detectPii(request)).rejects.toBeInstanceOf(errorClass)
    await expect(ml.maskPii(request)).rejects.toBeInstanceOf(errorClass)
  })

  it('turns an unreachable service into an unavailable error and a slow one into a timeout', async () => {
    const down = service(() => Promise.reject(new TypeError('fetch failed')))
    await expect(down.maskPii(request)).rejects.toBeInstanceOf(MlUnavailableError)
    const slow = new HttpMlService({
      baseUrl: 'https://ml.test/',
      serviceToken: 't'.repeat(32),
      piiTimeoutMs: 5,
      fetch: (req) =>
        new Promise((_resolve, reject) => {
          ;(req as Request).signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    })
    await expect(slow.detectPii(request)).rejects.toBeInstanceOf(MlTimeoutError)
  })
})
