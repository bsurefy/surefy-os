// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'

import { createMlClient, mlErrorCode, ML_RETRYABLE_CODES } from './index.js'

import type { DetectPiiResponse, MaskPiiResponse, ParsedDocument } from './index.js'

const parsed: ParsedDocument = {
  title: 'Handbook',
  language: null,
  pages: 1,
  sections: [{ headingPath: ['Setup'], text: 'Install it.', pageFrom: 1, pageTo: 1 }],
  tables: [],
  usedOcr: false,
}

function fakeFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )
}

describe('createMlClient', () => {
  it('sends the service token, request ID and body to the parse endpoint', async () => {
    const fetch = fakeFetch(200, parsed)
    const ml = createMlClient({ baseUrl: 'https://ml.test/', serviceToken: 'secret', fetch })

    const { data } = await ml.POST('/v1/documents/parse', {
      body: {
        fileUrl: 'https://files.test/a.pdf',
        mimeType: 'application/pdf',
        orgId: '0190a5c4-0000-7000-8000-000000000000',
      },
      headers: { 'x-request-id': 'req_1' },
    })

    expect(data).toEqual(parsed)
    const request = fetch.mock.calls[0]?.[0] as Request
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://ml.test/v1/documents/parse')
    expect(request.headers.get('authorization')).toBe('Bearer secret')
    expect(request.headers.get('x-request-id')).toBe('req_1')
    expect(await request.json()).toMatchObject({ mimeType: 'application/pdf' })
  })

  it('returns the error envelope of a failed call', async () => {
    const envelope = {
      error: { code: 'ML_BUSY', message: 'All workers are busy', requestId: 'req_2', details: [] },
    }
    const ml = createMlClient({
      baseUrl: 'https://ml.test',
      serviceToken: 'secret',
      fetch: fakeFetch(503, envelope),
    })

    const { data, error, response } = await ml.GET('/health/ready')

    expect(data).toBeUndefined()
    expect(response.status).toBe(503)
    expect(mlErrorCode(error)).toBe('ML_BUSY')
    expect(ML_RETRYABLE_CODES.has('ML_BUSY')).toBe(true)
  })
})

describe('personal-data endpoints', () => {
  const orgId = '0190a5c4-0000-7000-8000-000000000000'

  it('sends texts, types and custom patterns to the mask endpoint', async () => {
    const masked: MaskPiiResponse = {
      language: 'en',
      results: [
        {
          text: 'Write to [EMAIL]',
          findings: [{ type: 'email', customLabel: null, start: 9, end: 24, score: 1 }],
        },
      ],
    }
    const fetch = fakeFetch(200, masked)
    const ml = createMlClient({ baseUrl: 'https://ml.test', serviceToken: 'secret', fetch })

    const { data } = await ml.POST('/v1/pii/mask', {
      body: {
        orgId,
        texts: ['Write to ana@example.com'],
        locale: 'en-US',
        types: ['email'],
        customPatterns: [{ label: 'Employee ID', pattern: 'EMP-\\d{5}' }],
      },
    })

    expect(data?.results[0]?.text).toBe('Write to [EMAIL]')
    const request = fetch.mock.calls[0]?.[0] as Request
    expect(request.url).toBe('https://ml.test/v1/pii/mask')
    expect(await request.json()).toMatchObject({ types: ['email'], locale: 'en-US' })
  })

  it('leaves optional request fields out and reads detect findings', async () => {
    const detected: DetectPiiResponse = {
      language: 'en',
      results: [{ findings: [] }],
    }
    const ml = createMlClient({
      baseUrl: 'https://ml.test',
      serviceToken: 'secret',
      fetch: fakeFetch(200, detected),
    })

    const { data } = await ml.POST('/v1/pii/detect', { body: { orgId, texts: ['Hello'] } })

    expect(data?.results[0]?.findings).toEqual([])
  })

  it('treats a pattern the service rejects as a non-retryable validation error', async () => {
    const envelope = {
      error: {
        code: 'ML_VALIDATION_FAILED',
        message: 'Request validation failed',
        requestId: 'req_3',
        details: [
          {
            path: 'customPatterns.0.pattern',
            code: 'pattern_too_slow',
            message: 'The pattern takes too long to match; simplify it',
          },
        ],
      },
    }
    const ml = createMlClient({
      baseUrl: 'https://ml.test',
      serviceToken: 'secret',
      fetch: fakeFetch(422, envelope),
    })

    const { error } = await ml.POST('/v1/pii/detect', { body: { orgId, texts: ['aaa'] } })

    expect(mlErrorCode(error)).toBe('ML_VALIDATION_FAILED')
    expect(ML_RETRYABLE_CODES.has('ML_VALIDATION_FAILED')).toBe(false)
  })
})

describe('mlErrorCode', () => {
  it.each([undefined, 'oops', { error: { code: 'SOMETHING_ELSE' } }])(
    'treats %j as an internal error',
    (body) => {
      expect(mlErrorCode(body)).toBe('ML_INTERNAL_ERROR')
    },
  )

  it('keeps non-retryable codes out of the retry set', () => {
    expect(ML_RETRYABLE_CODES.has('ML_UNSUPPORTED_FILE')).toBe(false)
    expect(ML_RETRYABLE_CODES.has('ML_FILE_TOO_LARGE')).toBe(false)
  })
})
