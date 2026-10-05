// SPDX-License-Identifier: AGPL-3.0-only
import type { ChatDocumentParser } from './chats.types.js'
import type { MlService } from '@/integrations/ml/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'

const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv'])
const SIGNED_URL_SECONDS = 600

export const isTextType = (contentType: string): boolean => TEXT_TYPES.has(contentType)

/**
 * Text files are decoded in process; PDF and Word files go to the ML service, which fetches them
 * through a short-lived signed URL and answers with sections and tables (documents are context
 * for one message and are never indexed).
 */
export function createChatDocumentParser(deps: {
  ml: MlService
  storage: StorageProvider
}): ChatDocumentParser {
  return {
    async extract({ orgId, objectKey, contentType, bytes, signal }) {
      if (isTextType(contentType)) return { text: bytes.toString('utf8'), pageCount: null }
      const fileUrl = await deps.storage.getSignedUrl(objectKey, {
        expiresInSeconds: SIGNED_URL_SECONDS,
      })
      const parsed = await deps.ml.parseDocument(
        { fileUrl, mimeType: contentType, orgId, ocr: 'auto' },
        signal,
      )
      const sections = parsed.sections.map((section) => section.text)
      const tables = parsed.tables.map((table) =>
        table.rows.map((row) => row.join(' | ')).join('\n'),
      )
      return { text: [...sections, ...tables].join('\n\n'), pageCount: parsed.pages }
    },
  }
}
