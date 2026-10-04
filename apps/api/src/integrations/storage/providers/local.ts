// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { StorageNotFoundError, StorageUnavailableError } from '../storage.errors.js'
import { assertStorageKey, assertStoragePrefix } from '../storage.keys.js'

import type { SignedUrlOptions, StorageProvider } from '../storage.types.js'

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

/** The API route that serves local files; the module that owns it verifies with `verifySignedFile`. */
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
    url.searchParams.set('signature', this.sign(key, expires, options.disposition))
    return Promise.resolve(url.toString())
  }

  /** Whether a signed download URL's parameters are authentic and not expired. */
  verifySignedFile(params: SignedFileParams, now = Date.now()): boolean {
    if (!Number.isInteger(params.expires) || params.expires * 1000 < now) return false
    const expected = Buffer.from(this.sign(params.key, params.expires, params.disposition), 'hex')
    const given = Buffer.from(params.signature, 'hex')
    return expected.length === given.length && timingSafeEqual(expected, given)
  }

  private sign(key: string, expires: number, disposition: string | undefined): string {
    return createHmac('sha256', this.signingKey)
      .update(`${key}\n${expires}\n${disposition ?? ''}`)
      .digest('hex')
  }
}
