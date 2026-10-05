// SPDX-License-Identifier: AGPL-3.0-only
import { LocalStorageProvider } from './providers/local.js'
import { S3StorageProvider } from './providers/s3.js'

import type { Config } from '@/core/config/index.js'
import type { Logger } from '@/core/logger/index.js'

export {
  StorageError,
  StorageInvalidKeyError,
  StorageNotFoundError,
  StorageSignedUrlUnavailableError,
  StorageUnavailableError,
} from './storage.errors.js'
export { assertStorageKey, assertStoragePrefix } from './storage.keys.js'
export type {
  PutOptions,
  SignedUpload,
  SignedUploadOptions,
  SignedUrlOptions,
  StorageProvider,
  StoredObjectInfo,
} from './storage.types.js'
export {
  LOCAL_FILES_PATH,
  LocalStorageProvider,
  type SignedFileParams,
  type SignedUploadParams,
} from './providers/local.js'
export { S3StorageProvider } from './providers/s3.js'

/** The storage provider selected by `STORAGE_DRIVER`. */
export function createStorage(
  config: Config,
  logger: Logger,
): LocalStorageProvider | S3StorageProvider {
  const { storage } = config
  logger.info({ driver: storage.driver }, 'storage provider selected')
  if (storage.driver === 'local') {
    return new LocalStorageProvider({
      rootPath: storage.path,
      publicUrl: config.api.publicUrl,
      encryptionKey: config.crypto.encryptionKey,
    })
  }
  return new S3StorageProvider({
    bucket: storage.bucket,
    region: storage.region,
    forcePathStyle: storage.forcePathStyle,
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
    ...(storage.endpoint === undefined ? {} : { endpoint: storage.endpoint }),
  })
}
