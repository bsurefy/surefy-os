// SPDX-License-Identifier: MIT

/** Every text the widget shows. Answers come from the agent; these are the widget's own words. */
export interface Labels {
  open: (agent: string) => string
  close: string
  newChat: string
  defaultGreeting: string
  placeholder: string
  send: string
  disclaimer: string
  thinking: string
  sources: string
  page: (page: number) => string
  waiting: string
  failed: string
  retry: string
  rateLimited: (seconds: number) => string
  unavailable: string
  offline: string
  loading: string
  answerReady: string
}

const en: Labels = {
  open: (agent) => `Open chat with ${agent}`,
  close: 'Close chat',
  newChat: 'New chat',
  defaultGreeting: 'Hi! How can I help?',
  placeholder: 'Type your message',
  send: 'Send',
  disclaimer: 'AI answers can be wrong',
  thinking: 'Thinking',
  sources: 'Sources',
  page: (page) => `page ${String(page)}`,
  waiting:
    'A person needs to check this before I can answer. Keep this open; the answer will appear here.',
  failed: 'Something went wrong. Try again.',
  retry: 'Retry',
  rateLimited: (seconds) =>
    `You're sending messages too quickly. Try again in ${String(seconds)} seconds.`,
  unavailable: "This chat isn't available right now.",
  offline: "You're offline. Your message will be sent when you're back.",
  loading: 'Loading',
  answerReady: 'New answer',
}

const LOCALES: Readonly<Record<string, Labels>> = { en }

/** The labels for a locale (`de-CH` falls back to `de`, then to English). */
export function labelsFor(locale: string | null | undefined): Labels {
  if (!locale) return en
  const lower = locale.toLowerCase()
  return LOCALES[lower] ?? LOCALES[lower.split('-')[0] ?? ''] ?? en
}
