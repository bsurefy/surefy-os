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
}
