// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the knowledge domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const KNOWLEDGE_ERROR_CODES = {
  KNOWLEDGE_NOT_FOUND: 'KNOWLEDGE_NOT_FOUND', // 404: a knowledge base that does not exist, is deleted, or the caller may not search; never reveals which
  KNOWLEDGE_SOURCE_NOT_FOUND: 'KNOWLEDGE_SOURCE_NOT_FOUND', // 404
  KNOWLEDGE_DOCUMENT_NOT_FOUND: 'KNOWLEDGE_DOCUMENT_NOT_FOUND', // 404
  KNOWLEDGE_NAME_TAKEN: 'KNOWLEDGE_NAME_TAKEN', // 409: unique per organization among active bases, case-insensitive; also a restore into a taken name
  KNOWLEDGE_BASE_DELETED: 'KNOWLEDGE_BASE_DELETED', // 409: restore a source whose base waits in Recently deleted
  KNOWLEDGE_NO_EMBEDDING_MODEL: 'KNOWLEDGE_NO_EMBEDDING_MODEL', // 409: the base has no embedding model, so nothing can be added
  KNOWLEDGE_EMBEDDING_MODEL_INVALID: 'KNOWLEDGE_EMBEDDING_MODEL_INVALID', // 422: not an enabled embedding model the base may use
  KNOWLEDGE_LOCAL_EMBEDDING_REQUIRED: 'KNOWLEDGE_LOCAL_EMBEDDING_REQUIRED', // 422: a "Local models only" base needs a local or trained embedding model
  KNOWLEDGE_REEMBED_IN_PROGRESS: 'KNOWLEDGE_REEMBED_IN_PROGRESS', // 409: another model change or re-index is running; cancel it first
  KNOWLEDGE_SOURCE_STATE_INVALID: 'KNOWLEDGE_SOURCE_STATE_INVALID', // 409: the action does not fit the source (retry a ready source, sync a file)
  KNOWLEDGE_DUPLICATE_FILE: 'KNOWLEDGE_DUPLICATE_FILE', // 409: the same bytes are already in this base; details name the existing source
  KNOWLEDGE_FILE_TOO_LARGE: 'KNOWLEDGE_FILE_TOO_LARGE', // 422: over `KNOWLEDGE_FILE_LIMITS.maxBytes`
  KNOWLEDGE_FILE_UNSUPPORTED: 'KNOWLEDGE_FILE_UNSUPPORTED', // 422 at upload; also a document's final failure when the bytes do not match
  KNOWLEDGE_UPLOAD_CORRUPTED: 'KNOWLEDGE_UPLOAD_CORRUPTED', // source failure: the stored bytes do not match the hash the browser sent
  KNOWLEDGE_PROCESSING_TIMEOUT: 'KNOWLEDGE_PROCESSING_TIMEOUT', // document failure: took too long twice
  KNOWLEDGE_DOWNLOAD_FAILED: 'KNOWLEDGE_DOWNLOAD_FAILED', // document failure: a crawled page or connector file could not be fetched
  KNOWLEDGE_LINK_UNREACHABLE: 'KNOWLEDGE_LINK_UNREACHABLE', // source failure: the link could not be reached
  KNOWLEDGE_CONNECTION_EXPIRED: 'KNOWLEDGE_CONNECTION_EXPIRED', // source failure: the connector sign-in expired; syncing is paused
  KNOWLEDGE_REEMBED_FAILED: 'KNOWLEDGE_REEMBED_FAILED', // document failure: re-embedding kept failing after retries
} as const

/** Codes a document or source can carry in `errorCode` (what the Sources table shows as the reason). */
export const KNOWLEDGE_FAILURE_CODES = [
  KNOWLEDGE_ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED,
  KNOWLEDGE_ERROR_CODES.KNOWLEDGE_UPLOAD_CORRUPTED,
  KNOWLEDGE_ERROR_CODES.KNOWLEDGE_PROCESSING_TIMEOUT,
  KNOWLEDGE_ERROR_CODES.KNOWLEDGE_DOWNLOAD_FAILED,
  KNOWLEDGE_ERROR_CODES.KNOWLEDGE_LINK_UNREACHABLE,
  KNOWLEDGE_ERROR_CODES.KNOWLEDGE_CONNECTION_EXPIRED,
  KNOWLEDGE_ERROR_CODES.KNOWLEDGE_REEMBED_FAILED,
] as const
