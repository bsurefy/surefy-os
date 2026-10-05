// SPDX-License-Identifier: AGPL-3.0-only
import type { ParsedDocument } from '@surefy/ml-client'

export type { DocumentSection, DocumentTable, ParsedDocument } from '@surefy/ml-client'

export interface ParseDocumentInput {
  /** A short-lived signed URL of the stored file; the bytes never travel in the request. */
  fileUrl: string
  mimeType: string
  orgId: string
  ocr: 'auto' | 'force' | 'off'
  /** The caller's request or job id, for log correlation across services. */
  requestId?: string
}

/** What SurefyOS needs from the ML service. Detection and training join with their phases. */
export interface MlService {
  parseDocument(input: ParseDocumentInput, signal?: AbortSignal): Promise<ParsedDocument>
}
