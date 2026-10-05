// SPDX-License-Identifier: AGPL-3.0-only
import { Readable } from 'node:stream'

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner'

import { StorageNotFoundError, StorageUnavailableError } from '../storage.errors.js'
import { assertStorageKey, assertStoragePrefix } from '../storage.keys.js'

import type {
  PutOptions,
  SignedUpload,
  SignedUploadOptions,
  SignedUrlOptions,
  StorageProvider,
  StoredObjectInfo,
} from '../storage.types.js'

export interface S3StorageOptions {
  bucket: string
  region: string
  endpoint?: string
  forcePathStyle: boolean
  accessKeyId: string
  secretAccessKey: string
}

const vendorErrorName = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
    ? error.name
    : undefined

/** Any S3-compatible service: AWS S3, Cloudflare R2, MinIO. */
export class S3StorageProvider implements StorageProvider {
  readonly driver = 's3' as const
  private readonly client: S3Client
  private readonly bucket: string

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket
    const clientConfig: S3ClientConfig = {
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    }
    this.client = new S3Client(clientConfig)
  }

  async put(key: string, body: Readable | Buffer, options: PutOptions): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: assertStorageKey(key),
          Body: body,
          ContentType: options.contentType,
          ...(options.size === undefined ? {} : { ContentLength: options.size }),
        }),
      )
    } catch (error) {
      throw new StorageUnavailableError('put', { cause: error })
    }
  }

  async get(key: string): Promise<Readable> {
    assertStorageKey(key)
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      if (response.Body instanceof Readable) return response.Body
      // The Node runtime always yields a Readable; anything else is a client misconfiguration.
      throw new StorageUnavailableError('get', { cause: new TypeError('body is not a stream') })
    } catch (error) {
      if (vendorErrorName(error) === 'NoSuchKey')
        throw new StorageNotFoundError(key, { cause: error })
      if (error instanceof StorageUnavailableError) throw error
      throw new StorageUnavailableError('get', { cause: error })
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: assertStorageKey(key) }),
      )
    } catch (error) {
      throw new StorageUnavailableError('delete', { cause: error })
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    const normalized = assertStoragePrefix(prefix)
    try {
      let continuationToken: string | undefined
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: normalized,
            ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
          }),
        )
        const keys = (page.Contents ?? []).flatMap((object) =>
          object.Key === undefined ? [] : [{ Key: object.Key }],
        )
        if (keys.length > 0) {
          await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: keys, Quiet: true },
            }),
          )
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (continuationToken !== undefined)
    } catch (error) {
      throw new StorageUnavailableError('deletePrefix', { cause: error })
    }
  }

  /** A presigned GET; the browser downloads straight from the bucket. */
  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    assertStorageKey(key)
    try {
      return await presign(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ...(options.disposition === undefined
            ? {}
            : { ResponseContentDisposition: options.disposition }),
        }),
        { expiresIn: options.expiresInSeconds },
      )
    } catch (error) {
      throw new StorageUnavailableError('sign', { cause: error })
    }
  }

  /**
   * A presigned PUT that signs the content type and the exact length, so the bucket refuses
   * another type or size even though a presigned URL has no size policy of its own.
   */
  async getSignedUploadUrl(key: string, options: SignedUploadOptions): Promise<SignedUpload> {
    assertStorageKey(key)
    try {
      const url = await presign(
        this.client,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: options.contentType,
          ContentLength: options.sizeBytes,
        }),
        {
          expiresIn: options.expiresInSeconds,
          signableHeaders: new Set(['content-type', 'content-length']),
        },
      )
      return {
        url,
        method: 'PUT',
        headers: { 'content-type': options.contentType },
        expiresAt: new Date(Date.now() + options.expiresInSeconds * 1000),
      }
    } catch (error) {
      throw new StorageUnavailableError('sign', { cause: error })
    }
  }

  async stat(key: string): Promise<StoredObjectInfo | null> {
    assertStorageKey(key)
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return { sizeBytes: head.ContentLength ?? 0 }
    } catch (error) {
      if (vendorErrorName(error) === 'NotFound' || vendorErrorName(error) === 'NoSuchKey') {
        return null
      }
      throw new StorageUnavailableError('stat', { cause: error })
    }
  }
}
