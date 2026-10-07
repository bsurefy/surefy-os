// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { text } from 'node:stream/consumers'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  assertStorageKey,
  assertStoragePrefix,
  LOCAL_FILES_PATH,
  LocalStorageProvider,
  S3StorageProvider,
  StorageInvalidKeyError,
  StorageNotFoundError,
} from '../index.js'

describe('storage keys', () => {
  it('accepts relative slash-separated keys and rejects traversal', () => {
    expect(assertStorageKey('orgs/o1/documents/a.pdf')).toBe('orgs/o1/documents/a.pdf')
    expect(assertStoragePrefix('orgs/o1')).toBe('orgs/o1/')
    expect(assertStoragePrefix('orgs/o1/')).toBe('orgs/o1/')
    for (const key of ['/abs', 'orgs/../etc', 'a//b', 'trailing/', 'bad key', 'orgs/./x', '']) {
      expect(() => assertStorageKey(key)).toThrow(StorageInvalidKeyError)
    }
  })
})

describe('LocalStorageProvider', () => {
  let root: string
  let storage: LocalStorageProvider

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'surefy-storage-'))
    storage = new LocalStorageProvider({
      rootPath: root,
      publicUrl: 'http://localhost:4000',
      encryptionKey: Buffer.alloc(32, 7).toString('base64'),
    })
  })
  afterAll(() => rm(root, { recursive: true, force: true }))

  it('stores buffers and streams and reads them back', async () => {
    await storage.put('orgs/o1/a.txt', Buffer.from('hello'), { contentType: 'text/plain' })
    await storage.put('orgs/o1/b.txt', Readable.from(['wor', 'ld']), { contentType: 'text/plain' })
    await expect(text(await storage.get('orgs/o1/a.txt'))).resolves.toBe('hello')
    await expect(text(await storage.get('orgs/o1/b.txt'))).resolves.toBe('world')
  })

  it('reports a missing object and tolerates deleting one', async () => {
    await expect(storage.get('orgs/o1/missing.txt')).rejects.toBeInstanceOf(StorageNotFoundError)
    await expect(storage.delete('orgs/o1/missing.txt')).resolves.toBeUndefined()
  })

  it('deletes everything under a prefix and nothing else', async () => {
    await storage.put('orgs/o2/x.txt', Buffer.from('x'), { contentType: 'text/plain' })
    await storage.put('orgs/o2-other/y.txt', Buffer.from('y'), { contentType: 'text/plain' })
    await storage.deletePrefix('orgs/o2')
    await expect(storage.get('orgs/o2/x.txt')).rejects.toBeInstanceOf(StorageNotFoundError)
    await expect(text(await storage.get('orgs/o2-other/y.txt'))).resolves.toBe('y')
  })

  it('refuses keys that could leave the root', async () => {
    await expect(
      storage.put('../escape.txt', Buffer.from('x'), { contentType: 'text/plain' }),
    ).rejects.toBeInstanceOf(StorageInvalidKeyError)
  })

  it('signs download URLs that verify until they expire and fail when tampered with', async () => {
    const url = new URL(
      await storage.getSignedUrl('orgs/o1/a.txt', {
        expiresInSeconds: 60,
        disposition: 'attachment; filename="a.txt"',
      }),
    )
    expect(url.origin + url.pathname).toBe(`http://localhost:4000${LOCAL_FILES_PATH}`)
    const params = {
      key: url.searchParams.get('key') ?? '',
      expires: Number(url.searchParams.get('expires')),
      disposition: url.searchParams.get('disposition') ?? undefined,
      signature: url.searchParams.get('signature') ?? '',
    }
    expect(storage.verifySignedFile(params)).toBe(true)
    expect(storage.verifySignedFile({ ...params, key: 'orgs/o1/b.txt' })).toBe(false)
    expect(storage.verifySignedFile({ ...params, disposition: undefined })).toBe(false)
    expect(storage.verifySignedFile(params, (params.expires + 1) * 1000)).toBe(false)
  })

  it('signs uploads for one key, type and size, and a download signature never authorizes one', async () => {
    const upload = await storage.getSignedUploadUrl('orgs/o1/up.bin', {
      expiresInSeconds: 60,
      contentType: 'application/pdf',
      sizeBytes: 10,
    })
    expect(upload).toMatchObject({ method: 'PUT', headers: { 'content-type': 'application/pdf' } })
    const url = new URL(upload.url)
    expect(url.origin + url.pathname).toBe(`http://localhost:4000${LOCAL_FILES_PATH}`)
    const params = {
      key: url.searchParams.get('key') ?? '',
      expires: Number(url.searchParams.get('expires')),
      contentType: url.searchParams.get('contentType') ?? '',
      sizeBytes: Number(url.searchParams.get('size')),
      signature: url.searchParams.get('signature') ?? '',
    }
    expect(storage.verifySignedUpload(params)).toBe(true)
    expect(storage.verifySignedUpload({ ...params, key: 'orgs/o1/other.bin' })).toBe(false)
    expect(storage.verifySignedUpload({ ...params, contentType: 'text/html' })).toBe(false)
    expect(storage.verifySignedUpload({ ...params, sizeBytes: 11 })).toBe(false)
    expect(storage.verifySignedUpload({ ...params, signature: 'x' })).toBe(false)
    expect(storage.verifySignedUpload(params, (params.expires + 1) * 1000)).toBe(false)

    // the same key, expiry and signature as a download do not verify as an upload, nor the reverse
    const download = new URL(await storage.getSignedUrl('orgs/o1/up.bin', { expiresInSeconds: 60 }))
    expect(
      storage.verifySignedUpload({
        ...params,
        signature: download.searchParams.get('signature') ?? '',
      }),
    ).toBe(false)
    expect(
      storage.verifySignedFile({
        key: params.key,
        expires: params.expires,
        signature: params.signature,
      }),
    ).toBe(false)
  })

  it('reports the size of a stored object, or null', async () => {
    await storage.put('orgs/o1/sized.txt', Buffer.from('12345'), { contentType: 'text/plain' })
    await expect(storage.stat('orgs/o1/sized.txt')).resolves.toEqual({ sizeBytes: 5 })
    await expect(storage.stat('orgs/o1/none.txt')).resolves.toBeNull()
    await expect(storage.stat('../escape')).rejects.toBeInstanceOf(StorageInvalidKeyError)
  })
})

describe('S3StorageProvider', () => {
  const storage = new S3StorageProvider({
    bucket: 'files',
    region: 'auto',
    forcePathStyle: true,
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    endpoint: 'https://s3.example.test',
  })

  it('presigns downloads with the disposition and an expiry', async () => {
    const url = new URL(
      await storage.getSignedUrl('orgs/o1/a.pdf', {
        expiresInSeconds: 120,
        disposition: 'attachment; filename="a.pdf"',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://s3.example.test/files/orgs/o1/a.pdf')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120')
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="a.pdf"',
    )
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('presigns uploads that sign the content type and the exact length', async () => {
    const upload = await storage.getSignedUploadUrl('orgs/o1/up.pdf', {
      expiresInSeconds: 600,
      contentType: 'application/pdf',
      sizeBytes: 1234,
    })
    expect(upload).toMatchObject({ method: 'PUT', headers: { 'content-type': 'application/pdf' } })
    const url = new URL(upload.url)
    expect(url.pathname).toBe('/files/orgs/o1/up.pdf')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(
      expect.arrayContaining(['content-type', 'content-length']),
    )
  })

  it('refuses keys that are not valid', async () => {
    await expect(
      storage.getSignedUploadUrl('../x', {
        expiresInSeconds: 60,
        contentType: 'a/b',
        sizeBytes: 1,
      }),
    ).rejects.toBeInstanceOf(StorageInvalidKeyError)
  })
})
