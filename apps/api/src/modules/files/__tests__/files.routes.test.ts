// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { LOCAL_FILES_PATH, type LocalStorageProvider } from '@/integrations/storage/index.js'
import { ERROR_CODES } from '@surefy/contracts'

import { expectError } from '../../../../test/helpers/request.js'
import { createTestApp } from '../../../../test/helpers/testApp.js'

import type { TestApp } from '../../../../test/helpers/testApp.js'

const pathOf = (url: string): string => {
  const parsed = new URL(url)
  return parsed.pathname + parsed.search
}

const KEY = 'orgs/0190a5c4-0000-7000-8000-000000000001/knowledge/doc-1/source'

async function signedUpload(
  testApp: TestApp,
  over: { contentType?: string; sizeBytes?: number } = {},
) {
  const storage = testApp.container.integrations.storage as LocalStorageProvider
  return storage.getSignedUploadUrl(KEY, {
    expiresInSeconds: 60,
    contentType: over.contentType ?? 'application/pdf',
    sizeBytes: over.sizeBytes ?? 5,
  })
}

describe('signed files', () => {
  it('stores an upload and serves it back through a signed download, as an attachment', async () => {
    const testApp = await createTestApp()
    const { app } = testApp
    const upload = await signedUpload(testApp)
    const put = await app.inject({
      method: 'PUT',
      url: pathOf(upload.url),
      headers: upload.headers,
      payload: Buffer.from('hello'),
    })
    expect(put.statusCode, put.body).toBe(204)

    const storage = testApp.container.integrations.storage as LocalStorageProvider
    expect(await storage.stat(KEY)).toEqual({ sizeBytes: 5 })
    const download = await app.inject({
      method: 'GET',
      url: pathOf(await storage.getSignedUrl(KEY, { expiresInSeconds: 60 })),
    })
    expect(download.statusCode).toBe(200)
    expect(download.body).toBe('hello')
    expect(download.headers['content-type']).toBe('application/octet-stream')
    expect(download.headers['content-disposition']).toBe('attachment')
    expect(download.headers['x-content-type-options']).toBe('nosniff')
  })

  it('refuses a link that was changed, and a download link used to upload', async () => {
    const testApp = await createTestApp()
    const { app } = testApp
    const upload = await signedUpload(testApp)
    const tampered = pathOf(upload.url).replace('size=5', 'size=6')
    expectError(
      await app.inject({
        method: 'PUT',
        url: tampered,
        headers: upload.headers,
        payload: 'hello!',
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    const storage = testApp.container.integrations.storage as LocalStorageProvider
    const download = new URL(await storage.getSignedUrl(KEY, { expiresInSeconds: 60 }))
    const asUpload = `${LOCAL_FILES_PATH}?key=${KEY}&expires=${download.searchParams.get('expires') ?? ''}&contentType=application%2Fpdf&size=5&signature=${download.searchParams.get('signature') ?? ''}`
    expectError(
      await app.inject({ method: 'PUT', url: asUpload, headers: upload.headers, payload: 'hello' }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await app.inject({
        method: 'GET',
        url: `${LOCAL_FILES_PATH}?key=${KEY}&expires=1&signature=${'a'.repeat(64)}`,
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })

  it('rejects another content type, and a body that is not the announced size, leaving no file', async () => {
    const testApp = await createTestApp()
    const { app } = testApp
    const storage = testApp.container.integrations.storage as LocalStorageProvider
    const upload = await signedUpload(testApp)
    expectError(
      await app.inject({
        method: 'PUT',
        url: pathOf(upload.url),
        headers: { 'content-type': 'text/html' },
        payload: 'hello',
      }),
      400,
      ERROR_CODES.BAD_REQUEST,
    )
    expectError(
      await app.inject({
        method: 'PUT',
        url: pathOf(upload.url),
        headers: upload.headers,
        payload: 'hi',
      }),
      400,
      ERROR_CODES.BAD_REQUEST,
    )
    expectError(
      await app.inject({
        method: 'PUT',
        url: pathOf(upload.url),
        headers: upload.headers,
        payload: 'hello world',
      }),
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
    )
    expect(await storage.stat(KEY)).toBeNull()
  })

  it('answers 404 for a valid link to a file that is not there', async () => {
    const testApp = await createTestApp()
    const storage = testApp.container.integrations.storage as LocalStorageProvider
    expectError(
      await testApp.app.inject({
        method: 'GET',
        url: pathOf(await storage.getSignedUrl('orgs/o/missing', { expiresInSeconds: 60 })),
      }),
      404,
      ERROR_CODES.NOT_FOUND,
    )
  })

  it('lets any origin use a signed link, without credentials', async () => {
    const testApp = await createTestApp()
    const upload = await signedUpload(testApp)
    const apiHost = new URL(upload.url).host
    const response = await testApp.app.inject({
      method: 'OPTIONS',
      url: pathOf(upload.url),
      headers: {
        host: apiHost,
        origin: 'https://app.example.test',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    })
    expect(response.headers['access-control-allow-origin']).toBe('https://app.example.test')
    expect(response.headers['access-control-allow-credentials']).toBeUndefined()
  })
})
