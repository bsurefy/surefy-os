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
  StorageSignedUrlUnavailableError,
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
})

describe('S3StorageProvider', () => {
  it('reports that signed URLs are unavailable without the presigner', async () => {
    const storage = new S3StorageProvider({
      bucket: 'b',
      region: 'auto',
      forcePathStyle: true,
      accessKeyId: 'k',
      secretAccessKey: 's',
      endpoint: 'http://127.0.0.1:9',
    })
    await expect(
      storage.getSignedUrl('orgs/o1/a.txt', { expiresInSeconds: 60 }),
    ).rejects.toBeInstanceOf(StorageSignedUrlUnavailableError)
  })
})
