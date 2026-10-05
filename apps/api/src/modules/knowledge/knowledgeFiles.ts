// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { StorageNotFoundError, type StorageProvider } from '@/integrations/storage/index.js'
import { KNOWLEDGE_FILE_LIMITS } from '@surefy/contracts'

import type { KnowledgeFiles } from './knowledge.types.js'

/** Reads a stored object into memory; documents are capped at 100 MB, parsed JSON is far smaller. */
async function readAll(storage: StorageProvider, key: string): Promise<Buffer | null> {
  try {
    const stream = await storage.get(key)
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array))
    return Buffer.concat(chunks)
  } catch (error) {
    if (error instanceof StorageNotFoundError) return null
    throw error
  }
}

/** The largest object `inspect` hashes: the knowledge file limit; anything bigger is not what was announced. */
const INSPECT_MAX_BYTES = KNOWLEDGE_FILE_LIMITS.maxBytes

/** The storage integration behind `KnowledgeFiles`. */
export function createKnowledgeFiles(storage: StorageProvider): KnowledgeFiles {
  return {
    async signedUpload(key, options) {
      const upload = await storage.getSignedUploadUrl(key, options)
      return {
        url: upload.url,
        method: upload.method,
        headers: upload.headers,
        expiresAt: upload.expiresAt,
      }
    },
    signedDownload: (key, options) => storage.getSignedUrl(key, options),
    async inspect(key) {
      const info = await storage.stat(key)
      if (info === null) return null
      // an object larger than any allowed file is never read: it cannot match what was announced
      if (info.sizeBytes > INSPECT_MAX_BYTES) return { sizeBytes: info.sizeBytes, sha256: '' }
      const stream = await storage.get(key)
      const hash = createHash('sha256')
      let sizeBytes = 0
      for await (const chunk of stream) {
        const bytes = chunk as Uint8Array
        sizeBytes += bytes.length
        hash.update(bytes)
      }
      return { sizeBytes, sha256: hash.digest('hex') }
    },
    put: (key, body, contentType) => storage.put(key, body, { contentType, size: body.length }),
    read: (key) => readAll(storage, key),
    delete: (key) => storage.delete(key),
  }
}

/** The text of a stored UTF-8 object, or null. */
export async function readText(files: KnowledgeFiles, key: string): Promise<string | null> {
  const bytes = await files.read(key)
  return bytes === null ? null : bytes.toString('utf8')
}
