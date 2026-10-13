// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the chat domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const CHAT_ERROR_CODES = {
  CHAT_NOT_FOUND: 'CHAT_NOT_FOUND', // 404: also for deleted and not-shared chats; never reveals whether one exists
  CHAT_MESSAGE_NOT_FOUND: 'CHAT_MESSAGE_NOT_FOUND', // 404
  CHAT_MESSAGE_STATE_INVALID: 'CHAT_MESSAGE_STATE_INVALID', // 409: the action does not fit the message (regenerate a user message, continue a finished answer)
  CHAT_STREAM_IN_PROGRESS: 'CHAT_STREAM_IN_PROGRESS', // 409: an answer is still streaming in this chat
  CHAT_FOLDER_NOT_FOUND: 'CHAT_FOLDER_NOT_FOUND', // 404
  CHAT_FOLDER_NAME_TAKEN: 'CHAT_FOLDER_NAME_TAKEN', // 409: unique per person, case-insensitive
  CHAT_PRIVATE_REQUIRES_LOCAL_MODEL: 'CHAT_PRIVATE_REQUIRES_LOCAL_MODEL', // 422: a private chat uses enabled local models only
  CHAT_MODEL_NO_VISION: 'CHAT_MODEL_NO_VISION', // 422: the message has images and the model cannot read them
  CHAT_ATTACHMENT_NOT_FOUND: 'CHAT_ATTACHMENT_NOT_FOUND', // 404
  CHAT_ATTACHMENT_NOT_READY: 'CHAT_ATTACHMENT_NOT_READY', // 409: sent while still uploading, processing or failed
  CHAT_ATTACHMENT_TOO_LARGE: 'CHAT_ATTACHMENT_TOO_LARGE', // 422: over the limit for its kind
  CHAT_ATTACHMENT_UNSUPPORTED: 'CHAT_ATTACHMENT_UNSUPPORTED', // 422: type not accepted, or the bytes do not match it
  CHAT_ATTACHMENT_UPLOAD_FAILED: 'CHAT_ATTACHMENT_UPLOAD_FAILED', // 502: the storage upload did not complete; Retry
  CHAT_FEEDBACK_NOT_ALLOWED: 'CHAT_FEEDBACK_NOT_ALLOWED', // 409: only complete or stopped assistant answers can be rated
  CHAT_SHARING_DISABLED: 'CHAT_SHARING_DISABLED', // 403: the organization turned chat sharing off
  CHAT_PRIVATE_NOT_SHAREABLE: 'CHAT_PRIVATE_NOT_SHAREABLE', // 422: private chats are never shared
  CHAT_SHARE_NOT_FOUND: 'CHAT_SHARE_NOT_FOUND', // 404
  CHAT_SHARE_TARGET_NOT_FOUND: 'CHAT_SHARE_TARGET_NOT_FOUND', // 422: a person or team is not in the organization
  CHAT_COMPARE_NOT_AVAILABLE: 'CHAT_COMPARE_NOT_AVAILABLE', // 422: agent chats have no compare, or B uses A's model
  CHAT_COMPARE_UNRESOLVED: 'CHAT_COMPARE_UNRESOLVED', // 409: choose answer A or B before sending the next message
  CHAT_WEB_SEARCH_NOT_ALLOWED: 'CHAT_WEB_SEARCH_NOT_ALLOWED', // 403: web search is off for the person, or no search provider is set up
  PROMPT_NOT_FOUND: 'PROMPT_NOT_FOUND', // 404: also for prompts the person cannot see
  PROMPT_TEAM_NOT_FOUND: 'PROMPT_TEAM_NOT_FOUND', // 422: a listed team is not in the organization
} as const
