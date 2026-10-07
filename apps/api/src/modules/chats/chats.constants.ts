// SPDX-License-Identifier: AGPL-3.0-only

/** The assistant message's parts are written to the database this often while it streams. */
export const STREAM_CHECKPOINT_MS = 5_000

/** A `streaming` message not updated for this long is `interrupted` (database/chat.md, §4). */
export const STREAM_STALE_MS = 120_000

/** Set on an assistant message whose stream stopped without finishing. */
export const INTERRUPTED_ERROR_CODE = 'CHAT_STREAM_INTERRUPTED'

/** How long a signed upload URL works. */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60

/** Attachments never sent with a message, and chats left empty, are removed after this long. */
export const UNLINKED_ATTACHMENT_HOURS = 24

/** Longest title the first answer generates. */
export const GENERATED_TITLE_MAX_CHARS = 80

/** Text of one message kept in a search hit shown under a title that did not match. */
export const MATCHED_TEXT_MAX_CHARS = 200

/** Passages of attachments and sources are cut to this much text in the model prompt. */
export const PROMPT_ATTACHMENT_MAX_CHARS = 60_000

export const CHAT_JOBS = {
  PROCESS_ATTACHMENT: 'processChatAttachment',
  SWEEP_STREAMS: 'sweepChatStreams',
  CLEANUP_ATTACHMENTS: 'cleanupChatAttachments',
} as const

export const SYSTEM_PROMPT = [
  'You are a helpful assistant inside SurefyOS.',
  'Answer in the language of the question. Be accurate and concise, and say when you are not sure.',
].join(' ')

export const SOURCES_PROMPT = [
  'Use the numbered sources below when they help. Cite them inline as [1], [2] after the claims',
  'they support, and never cite a source you did not use. If the sources do not answer the question,',
  'say so and answer from general knowledge.',
].join(' ')

export const TITLE_PROMPT =
  'Write a title of at most six words for this conversation. Reply with the title only, no quotes.'

export const CONTINUE_PROMPT = 'Continue exactly where your previous answer stopped.'
