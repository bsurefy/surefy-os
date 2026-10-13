// SPDX-License-Identifier: MIT
import { MESSAGES_MAX, type WidgetMessage, type WidgetSourceEvent } from './protocol.js'

/**
 * `streaming`: words are arriving · `waiting`: an action waits for a person · `done` ·
 * `failed`: the answer did not come (Retry).
 */
export type AnswerState = 'streaming' | 'waiting' | 'done' | 'failed'

export interface VisitorEntry {
  id: string
  role: 'user'
  text: string
}

export interface AnswerEntry {
  id: string
  role: 'assistant'
  text: string
  sources: WidgetSourceEvent[]
  state: AnswerState
  errorCode: string | null
  /** The run behind the answer, and the last event received, to reattach after a wait. */
  runId: string | null
  lastEventId: string | null
}

export type Entry = VisitorEntry | AnswerEntry

export interface ConversationState {
  conversationId: string
  entries: Entry[]
}

const STORAGE_PREFIX = 'surefy-widget:'

/** A per-token key that does not keep the whole token in storage. */
export const storageKeyOf = (token: string) => `${STORAGE_PREFIX}${token.slice(0, 11)}`

export const newConversation = (): ConversationState => ({
  conversationId: crypto.randomUUID(),
  entries: [],
})

const isEntry = (value: unknown): value is Entry => {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<Entry>
  return (
    typeof entry.id === 'string' &&
    typeof entry.text === 'string' &&
    (entry.role === 'user' || entry.role === 'assistant')
  )
}

/** The conversation of this tab, or a new one when nothing usable is stored. */
export function loadConversation(storage: Storage | null, key: string): ConversationState {
  try {
    const raw = storage?.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ConversationState>
      if (
        typeof parsed.conversationId === 'string' &&
        Array.isArray(parsed.entries) &&
        parsed.entries.every(isEntry)
      ) {
        return { conversationId: parsed.conversationId, entries: parsed.entries }
      }
    }
  } catch {
    // Storage blocked (privacy settings) or a damaged value: start over.
  }
  return newConversation()
}

export function saveConversation(
  storage: Storage | null,
  key: string,
  state: ConversationState,
): void {
  try {
    storage?.setItem(key, JSON.stringify(state))
  } catch {
    // Storage full or blocked: the conversation still works for this page.
  }
}

/**
 * What the next request sends: finished turns only (a failed answer is left out), the last
 * `MESSAGES_MAX`, starting with the visitor so the agent never sees a reply without its question.
 */
export function messagesToSend(entries: readonly Entry[]): WidgetMessage[] {
  const messages: WidgetMessage[] = []
  for (const entry of entries) {
    if (entry.role === 'user') messages.push({ role: 'user', text: entry.text })
    else if (entry.state === 'done' && entry.text.trim() !== '')
      messages.push({ role: 'assistant', text: entry.text })
  }
  let recent = messages.slice(-MESSAGES_MAX)
  while (recent.length > 1 && recent[0]?.role === 'assistant') recent = recent.slice(1)
  return recent
}
