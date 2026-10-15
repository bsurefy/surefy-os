// SPDX-License-Identifier: AGPL-3.0-only
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
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

// ── V1: shares, compare, prompts ──────────────────────────────────────────────────────────────

/** The organization turned chat sharing off (Settings › Data & privacy). */
export class ChatSharingDisabledError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.CHAT_SHARING_DISABLED, 'Chat sharing is turned off for this organization')
  }
}

export class ChatPrivateNotShareableError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.CHAT_PRIVATE_NOT_SHAREABLE, 'Private chats are never shared')
  }
}

export class ChatShareNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.CHAT_SHARE_NOT_FOUND, 'Share not found')
  }
}

/** A person or team to share with is not in the organization. */
export class ChatShareTargetNotFoundError extends UnprocessableError {
  constructor(field: 'userId' | 'teamId') {
    super(ERROR_CODES.CHAT_SHARE_TARGET_NOT_FOUND, 'A person or team is not in this organization', {
      details: [{ field }],
    })
  }
}

/** Agent chats have no compare, and answer B needs a model other than answer A's. */
export class ChatCompareNotAvailableError extends UnprocessableError {
  constructor(message = 'Compare is not available here') {
    super(ERROR_CODES.CHAT_COMPARE_NOT_AVAILABLE, message)
  }
}

/** Answer A or B must be chosen before the chat goes on. */
export class ChatCompareUnresolvedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.CHAT_COMPARE_UNRESOLVED, 'Choose answer A or B first')
  }
}

/** A prompt that does not exist for this person: also deleted ones and those they cannot see. */
export class PromptNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.PROMPT_NOT_FOUND, 'Prompt not found')
  }
}

export class PromptTeamNotFoundError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.PROMPT_TEAM_NOT_FOUND, 'A team is not in this organization', {
      details: [{ field: 'teamIds' }],
    })
  }
}

/** Shared prompts are created, changed, shared with teams, deleted and restored by Builders and above. */
export class PromptManageForbiddenError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.ACCESS_FORBIDDEN, 'Only Builders and above manage shared prompts')
  }
}

/** Web search is off for the person, or no search provider is set up. */
export class ChatWebSearchNotAllowedError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.CHAT_WEB_SEARCH_NOT_ALLOWED, 'Web search is not available here')
  }
}
