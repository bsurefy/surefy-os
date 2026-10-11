// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the chats module writes to the audit log (`<area>.<verb>`). Sharing a chat (target type
 * `chat`; metadata: the people and teams) and every change to a shared prompt (target type
 * `prompt`) are audited; personal chats and prompts are not, and chat content never is.
 */
export const CHAT_AUDIT_ACTIONS = {
  CHAT_SHARED: 'chat.shared',
  CHAT_UNSHARED: 'chat.unshared',
  PROMPT_CREATED: 'prompt.created',
  PROMPT_UPDATED: 'prompt.updated',
  PROMPT_DELETED: 'prompt.deleted',
  PROMPT_RESTORED: 'prompt.restored',
} as const
export type ChatAuditAction = (typeof CHAT_AUDIT_ACTIONS)[keyof typeof CHAT_AUDIT_ACTIONS]
