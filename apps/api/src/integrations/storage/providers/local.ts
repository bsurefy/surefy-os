// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { StorageNotFoundError, StorageUnavailableError } from '../storage.errors.js'
import { assertStorageKey, assertStoragePrefix } from '../storage.keys.js'

import type {
  SignedUpload,
  SignedUploadOptions,
  SignedUrlOptions,
  StorageProvider,
  StoredObjectInfo,
} from '../storage.types.js'

export interface LocalStorageOptions {
  /** The mounted volume that holds the files. */
  rootPath: string
  /** `API_PUBLIC_URL`: the host the signed download URLs point at. */
  publicUrl: string
  /** `ENCRYPTION_KEY` (base64): a signing key is derived from it, never used directly. */
  encryptionKey: string
}

export interface SignedFileParams {
  key: string
  expires: number
  disposition?: string
  signature: string
}

/** The query of a signed upload: the same key and expiry, plus the type and size it is limited to. */
export interface SignedUploadParams {
  key: string
  expires: number
  contentType: string
  sizeBytes: number
  signature: string
}

/**
 * The API route that serves local files (GET) and takes local uploads (PUT); the files module
 * verifies them with `verifySignedFile` and `verifySignedUpload`.
 */
export const LOCAL_FILES_PATH = '/api/v1/files'

const errnoCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined

/**
 * Single-server self-host: files on a mounted volume, served through signed API routes. The
 * signature is an HMAC over key, expiry and disposition with a key derived from `ENCRYPTION_KEY`.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly driver = 'local' as const
  private readonly root: string
  private readonly signingKey: Buffer

  constructor(private readonly options: LocalStorageOptions) {
    this.root = resolve(options.rootPath)
    this.signingKey = Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from(options.encryptionKey, 'base64'),
        '',
        'surefy:storage-signed-url:v1',
        32,
      ),
    )
  }

  private pathOf(key: string): string {
    const path = join(this.root, assertStorageKey(key))
    // Defense in depth: the key check already rejects traversal, the path must still be inside.
    if (!path.startsWith(this.root + sep)) throw new StorageNotFoundError(key)
    return path
  }

  async put(
    key: string,
    body: Readable | Buffer,
    _options: { contentType: string },
  ): Promise<void> {
    const path = this.pathOf(key)
    try {
      await mkdir(dirname(path), { recursive: true })
      const source = Buffer.isBuffer(body) ? Readable.from([body]) : body
      await pipeline(source, createWriteStream(path))
    } catch (error) {
      throw new StorageUnavailableError('put', { cause: error })
    }
  }

  async get(key: string): Promise<Readable> {
    const path = this.pathOf(key)
    try {
      await access(path)
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') throw new StorageNotFoundError(key, { cause: error })
      throw new StorageUnavailableError('get', { cause: error })
    }
    return createReadStream(path)
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(this.pathOf(key), { force: true })
    } catch (error) {
      throw new StorageUnavailableError('delete', { cause: error })
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    const path = join(this.root, assertStoragePrefix(prefix))
    if (!path.startsWith(this.root + sep)) return
    try {
      await rm(path, { recursive: true, force: true })
    } catch (error) {
      throw new StorageUnavailableError('deletePrefix', { cause: error })
    }
  }

  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    assertStorageKey(key)
    const expires = Math.floor(Date.now() / 1000) + options.expiresInSeconds
    const url = new URL(LOCAL_FILES_PATH, this.options.publicUrl)
    url.searchParams.set('key', key)
    url.searchParams.set('expires', String(expires))
    if (options.disposition !== undefined) url.searchParams.set('disposition', options.disposition)
    url.searchParams.set('signature', this.sign('GET', key, expires, [options.disposition ?? '']))
    return Promise.resolve(url.toString())
  }

  getSignedUploadUrl(key: string, options: SignedUploadOptions): Promise<SignedUpload> {
    assertStorageKey(key)
    const expires = Math.floor(Date.now() / 1000) + options.expiresInSeconds
    const url = new URL(LOCAL_FILES_PATH, this.options.publicUrl)
    url.searchParams.set('key', key)
    url.searchParams.set('expires', String(expires))
    url.searchParams.set('contentType', options.contentType)
    url.searchParams.set('size', String(options.sizeBytes))
    url.searchParams.set(
      'signature',
      this.sign('PUT', key, expires, [options.contentType, String(options.sizeBytes)]),
    )
    return Promise.resolve({
      url: url.toString(),
      method: 'PUT',
      headers: { 'content-type': options.contentType },
      expiresAt: new Date(expires * 1000),
    })
  }

  async stat(key: string): Promise<StoredObjectInfo | null> {
    const path = this.pathOf(key)
    try {
      const info = await stat(path)
      return info.isFile() ? { sizeBytes: info.size } : null
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return null
      throw new StorageUnavailableError('stat', { cause: error })
    }
  }

  /** Whether a signed download URL's parameters are authentic and not expired. */
  verifySignedFile(params: SignedFileParams, now = Date.now()): boolean {
    return this.verify(
      'GET',
      params.key,
      params.expires,
      [params.disposition ?? ''],
      params.signature,
      now,
    )
  }

  /** Whether a signed upload's parameters are authentic and not expired. */
  verifySignedUpload(params: SignedUploadParams, now = Date.now()): boolean {
    return this.verify(
      'PUT',
      params.key,
      params.expires,
      [params.contentType, String(params.sizeBytes)],
      params.signature,
      now,
    )
  }

  private verify(
    method: 'GET' | 'PUT',
    key: string,
    expires: number,
    parts: readonly string[],
    signature: string,
    now: number,
  ): boolean {
    if (!Number.isInteger(expires) || expires * 1000 < now) return false
    if (!/^[0-9a-f]{64}$/.test(signature)) return false
    const expected = Buffer.from(this.sign(method, key, expires, parts), 'hex')
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
  }

  /** The method leads the signed text, so a download signature can never authorize an upload. */
  private sign(
    method: 'GET' | 'PUT',
    key: string,
    expires: number,
    parts: readonly string[],
  ): string {
    return createHmac('sha256', this.signingKey)
      .update([method, key, String(expires), ...parts].join('\n'))
      .digest('hex')
  }
}
