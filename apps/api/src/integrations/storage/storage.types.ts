// SPDX-License-Identifier: AGPL-3.0-only
import type { Readable } from 'node:stream'

export interface PutOptions {
  contentType: string
  /** Known size in bytes; lets providers stream without buffering. */
  size?: number
}

export interface SignedUrlOptions {
  expiresInSeconds: number
  /** `Content-Disposition` for the download, for example `attachment; filename="report.pdf"`. */
  disposition?: string
}

export interface SignedUploadOptions {
  expiresInSeconds: number
  /** The `Content-Type` the upload must send; part of the signature. */
  contentType: string
  /** The exact size of the file in bytes, declared by the client and enforced by storage. */
  sizeBytes: number
}

/** A short-lived upload: the browser sends the bytes with `method` to `url` and these headers. */
export interface SignedUpload {
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresAt: Date
}

/** What storage knows about a stored object without reading it. */
export interface StoredObjectInfo {
  sizeBytes: number
}

/**
 * What SurefyOS needs from object storage. Keys always start with `orgs/{orgId}/`, and signed
 * URLs are short-lived and generated only after an access check (multi-tenancy.md, §5).
 */
export interface StorageProvider {
  readonly driver: 'local' | 's3'
  put(key: string, body: Readable | Buffer, options: PutOptions): Promise<void>
  get(key: string): Promise<Readable>
  delete(key: string): Promise<void>
  /** Organization data deletion: removes every object under the prefix. */
  deletePrefix(prefix: string): Promise<void>
  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string>
  /** A signed PUT for one object, generated only after an access check; no request is made. */
  getSignedUploadUrl(key: string, options: SignedUploadOptions): Promise<SignedUpload>
  /** The stored object's size, or null when nothing is stored under the key. */
  stat(key: string): Promise<StoredObjectInfo | null>
}
