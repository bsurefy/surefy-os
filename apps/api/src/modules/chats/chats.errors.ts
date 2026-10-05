// SPDX-License-Identifier: AGPL-3.0-only
import { AppError, ConflictError, NotFoundError, UnprocessableError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

/** A chat that does not exist for this person: also deleted, other people's and other organizations'. */
export class ChatNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.CHAT_NOT_FOUND, 'Chat not found')
  }
}

export class ChatMessageNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.CHAT_MESSAGE_NOT_FOUND, 'Message not found')
  }
}

/** Regenerate a user message, continue a finished answer, rate a message that is still streaming. */
export class ChatMessageStateInvalidError extends ConflictError {
  constructor(message = 'This action does not fit the message') {
    super(ERROR_CODES.CHAT_MESSAGE_STATE_INVALID, message)
  }
}

export class ChatStreamInProgressError extends ConflictError {
  constructor() {
    super(ERROR_CODES.CHAT_STREAM_IN_PROGRESS, 'An answer is still streaming in this chat')
  }
}

export class ChatFolderNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.CHAT_FOLDER_NOT_FOUND, 'Folder not found')
  }
}

export class ChatFolderNameTakenError extends ConflictError {
  constructor() {
    super(ERROR_CODES.CHAT_FOLDER_NAME_TAKEN, 'You already have a folder with this name')
  }
}

export class ChatPrivateRequiresLocalModelError extends UnprocessableError {
  constructor() {
    super(
      ERROR_CODES.CHAT_PRIVATE_REQUIRES_LOCAL_MODEL,
      'A private chat uses enabled local models only',
    )
  }
}

export class ChatModelNoVisionError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.CHAT_MODEL_NO_VISION, 'This model cannot read images')
  }
}

export class ChatAttachmentNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.CHAT_ATTACHMENT_NOT_FOUND, 'Attachment not found')
  }
}

export class ChatAttachmentNotReadyError extends ConflictError {
  constructor() {
    super(ERROR_CODES.CHAT_ATTACHMENT_NOT_READY, 'An attachment is not ready yet')
  }
}

export class ChatAttachmentTooLargeError extends UnprocessableError {
  constructor(maxBytes: number) {
    super(ERROR_CODES.CHAT_ATTACHMENT_TOO_LARGE, 'The file is over the size limit', {
      details: [{ maxBytes }],
    })
  }
}

export class ChatAttachmentUnsupportedError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.CHAT_ATTACHMENT_UNSUPPORTED, 'This file type is not supported')
  }
}

/** The bytes did not reach storage, or do not match what was announced. */
export class ChatAttachmentUploadFailedError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super(ERROR_CODES.CHAT_ATTACHMENT_UPLOAD_FAILED, 502, 'The upload did not complete', options)
  }
}

export class ChatFeedbackNotAllowedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.CHAT_FEEDBACK_NOT_ALLOWED, 'Only finished assistant answers can be rated')
  }
}
