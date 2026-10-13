// SPDX-License-Identifier: AGPL-3.0-only
import type {
  DetectPiiResponse,
  MaskPiiResponse,
  ParsedDocument,
  PiiRequest,
} from '@surefy/ml-client'

export type {
  CustomPattern,
  DetectPiiResponse,
  DocumentSection,
  DocumentTable,
  MaskPiiResponse,
  ParsedDocument,
  PiiFinding,
  PiiFindingType,
  PiiType,
} from '@surefy/ml-client'

export interface ParseDocumentInput {
  /** A short-lived signed URL of the stored file; the bytes never travel in the request. */
  fileUrl: string
  mimeType: string
  orgId: string
  ocr: 'auto' | 'force' | 'off'
  /** The caller's request or job id, for log correlation across services. */
  requestId?: string
}

/**
 * The request of `/v1/pii/*`: the texts, the built-in types to look for (all when absent) and the
 * organization's custom patterns. The service returns positions and placeholders; which type does
 * what stays in `guard`.
 */
export interface PiiInput {
  orgId: string
  texts: readonly string[]
  locale?: string
  types?: PiiRequest['types']
  customPatterns?: PiiRequest['customPatterns']
  /** The caller's request or job id, for log correlation across services. */
  requestId?: string
}

/** What SurefyOS needs from the ML service. Training joins with its phase. */
export interface MlService {
  parseDocument(input: ParseDocumentInput, signal?: AbortSignal): Promise<ParsedDocument>
  /** Where personal data sits in each text; the matched text is never returned. */
  detectPii(input: PiiInput, signal?: AbortSignal): Promise<DetectPiiResponse>
  /** Each text with its personal data replaced by placeholders. */
  maskPii(input: PiiInput, signal?: AbortSignal): Promise<MaskPiiResponse>
}
