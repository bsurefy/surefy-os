// SPDX-License-Identifier: AGPL-3.0-only
import { Readable } from 'node:stream'

import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
} from '@/core/errors/index.js'
import {
  StorageNotFoundError,
  StorageUnavailableError,
  type LocalStorageProvider,
} from '@/integrations/storage/index.js'

import type { DownloadFileQuery, UploadFileQuery } from './files.schema.js'

/** The text a file is served with when the signature names none. */
const DEFAULT_DISPOSITION = 'attachment'

/**
 * Local storage's signed links: the signature is the authorization, so these routes take no
 * session. A link works for one key, one method and, for uploads, one content type and size.
 */
export class FilesService {
  constructor(private readonly storage: LocalStorageProvider) {}

  /** The stored file with the headers it is served with; never rendered inline by default. */
  async download(query: DownloadFileQuery): Promise<{ stream: Readable; disposition: string }> {
    const verified = this.storage.verifySignedFile({
      key: query.key,
      expires: query.expires,
      signature: query.signature,
      ...(query.disposition === undefined ? {} : { disposition: query.disposition }),
    })
    if (!verified) throw new ForbiddenError()
    try {
      return {
        stream: await this.storage.get(query.key),
        disposition: query.disposition ?? DEFAULT_DISPOSITION,
      }
    } catch (error) {
      if (error instanceof StorageNotFoundError) throw new NotFoundError()
      throw error
    }
  }

  /**
   * Stores the body under the signed key. The type must match the signature and the body must
   * have exactly the announced size; anything else is removed again.
   */
  async upload(
    query: UploadFileQuery,
    contentType: string | undefined,
    body: Readable,
  ): Promise<void> {
    const verified = this.storage.verifySignedUpload({
      key: query.key,
      expires: query.expires,
      contentType: query.contentType,
      sizeBytes: query.size,
      signature: query.signature,
    })
    if (!verified) throw new ForbiddenError()
    if (contentType?.split(';')[0]?.trim().toLowerCase() !== query.contentType.toLowerCase()) {
      throw new BadRequestError(undefined, 'The content type does not match the signed link')
    }
    let received = 0
    // a body longer than announced stops at once: the stream fails and the partial file is removed
    const limited = Readable.from(
      (async function* () {
        for await (const chunk of body) {
          const bytes = chunk as Buffer
          received += bytes.length
          if (received > query.size) {
            throw new PayloadTooLargeError(undefined, 'The file is larger than it was announced')
          }
          yield bytes
        }
      })(),
    )
    try {
      await this.storage.put(query.key, limited, { contentType: query.contentType })
    } catch (error) {
      await this.storage.delete(query.key)
      // the storage wraps what went wrong in the stream; the limit's own error is what the client needs
      const cause = error instanceof StorageUnavailableError ? error.cause : error
      throw cause instanceof AppError ? cause : error
    }
    if (received !== query.size) {
      await this.storage.delete(query.key)
      throw new BadRequestError(undefined, 'The file is smaller than it was announced')
    }
  }
}
