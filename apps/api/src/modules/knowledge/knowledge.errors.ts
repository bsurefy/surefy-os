// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictError, NotFoundError, UnprocessableError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'
import type { KnowledgeDuplicateFileDetails } from '@surefy/contracts'

/** A base that does not exist, is deleted, or the caller may not search: never says which. */
export class KnowledgeNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.KNOWLEDGE_NOT_FOUND, 'Knowledge base not found')
  }
}

export class KnowledgeSourceNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.KNOWLEDGE_SOURCE_NOT_FOUND, 'Source not found')
  }
}

export class KnowledgeDocumentNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.KNOWLEDGE_DOCUMENT_NOT_FOUND, 'Document not found')
  }
}

export class KnowledgeNameTakenError extends ConflictError {
  constructor() {
    super(ERROR_CODES.KNOWLEDGE_NAME_TAKEN, 'A knowledge base with this name already exists')
  }
}

export class KnowledgeBaseDeletedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.KNOWLEDGE_BASE_DELETED, 'Restore the knowledge base first')
  }
}

export class KnowledgeNoEmbeddingModelError extends ConflictError {
  constructor() {
    super(
      ERROR_CODES.KNOWLEDGE_NO_EMBEDDING_MODEL,
      'Choose an embedding model before adding documents',
    )
  }
}

export class KnowledgeEmbeddingModelInvalidError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.KNOWLEDGE_EMBEDDING_MODEL_INVALID, 'This is not an enabled embedding model')
  }
}

export class KnowledgeLocalEmbeddingRequiredError extends UnprocessableError {
  constructor() {
    super(
      ERROR_CODES.KNOWLEDGE_LOCAL_EMBEDDING_REQUIRED,
      'A local-models-only knowledge base needs a local embedding model',
    )
  }
}

export class KnowledgeReembedInProgressError extends ConflictError {
  constructor() {
    super(
      ERROR_CODES.KNOWLEDGE_REEMBED_IN_PROGRESS,
      'Another model change or re-index is running; cancel it first',
    )
  }
}

export class KnowledgeSourceStateInvalidError extends ConflictError {
  constructor(message = 'This action does not fit the source as it is now') {
    super(ERROR_CODES.KNOWLEDGE_SOURCE_STATE_INVALID, message)
  }
}

export class KnowledgeDuplicateFileError extends ConflictError {
  constructor(details: KnowledgeDuplicateFileDetails) {
    super(ERROR_CODES.KNOWLEDGE_DUPLICATE_FILE, 'This file is already in the knowledge base', {
      details: [{ ...details }],
    })
  }
}

export class KnowledgeFileTooLargeError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.KNOWLEDGE_FILE_TOO_LARGE, 'This file is larger than the limit')
  }
}

export class KnowledgeFileUnsupportedError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED, 'This file type is not supported')
  }
}

/** A grant to a person who is not an active member of the organization. */
export class KnowledgeGranteeNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.MEMBER_NOT_FOUND, 'Member not found')
  }
}
