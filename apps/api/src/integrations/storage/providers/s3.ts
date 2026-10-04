// SPDX-License-Identifier: AGPL-3.0-only
import { Readable } from 'node:stream'

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'

import {
  StorageNotFoundError,
  StorageSignedUrlUnavailableError,
  StorageUnavailableError,
} from '../storage.errors.js'
import { assertStorageKey, assertStoragePrefix } from '../storage.keys.js'

import type { PutOptions, SignedUrlOptions, StorageProvider } from '../storage.types.js'

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

  getSignedUrl(key: string, _options: SignedUrlOptions): Promise<string> {
    assertStorageKey(key)
    // Presigning needs @aws-sdk/s3-request-presigner, which is not a dependency yet. Adding it
    // is its own dependency change; until then S3 installs cannot hand out direct download URLs.
    return Promise.reject(
      new StorageSignedUrlUnavailableError(
        'S3 signed URLs need @aws-sdk/s3-request-presigner, which is not installed',
      ),
    )
  }
}
