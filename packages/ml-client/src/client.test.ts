// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'

import { createMlClient, mlErrorCode, ML_RETRYABLE_CODES } from './index.js'

import type { ParsedDocument } from './index.js'

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
