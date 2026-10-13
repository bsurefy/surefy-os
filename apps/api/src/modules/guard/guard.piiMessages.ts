// SPDX-License-Identifier: AGPL-3.0-only
import type { ModelMessage } from 'ai'

/**
 * Applies `change` to every piece of text a model reads in these messages, in order: plain content,
 * text parts and the text results of tool calls. Images, files and the model's own tool-call
 * arguments are not text the person wrote and stay as they are.
 */
export function mapMessageTexts(
  messages: readonly ModelMessage[],
  change: (text: string) => string,
): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    if (message.role === 'system') return { ...message, content: change(message.content) }
    if (message.role === 'user') {
      if (typeof message.content === 'string')
        return { ...message, content: change(message.content) }
      return {
        ...message,
        content: message.content.map((part) =>
          part.type === 'text' ? { ...part, text: change(part.text) } : part,
        ),
      }
    }
    if (message.role === 'assistant') {
      if (typeof message.content === 'string')
        return { ...message, content: change(message.content) }
      return {
        ...message,
        content: message.content.map((part) =>
          part.type === 'text' ? { ...part, text: change(part.text) } : part,
        ),
      }
    }
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === 'tool-result' && part.output.type === 'text'
          ? { ...part, output: { ...part.output, value: change(part.output.value) } }
          : part,
      ),
    }
  })
}

/** The texts `mapMessageTexts` visits, in order. */
export function textsOfMessages(messages: readonly ModelMessage[]): string[] {
  const texts: string[] = []
  mapMessageTexts(messages, (text) => {
    texts.push(text)
    return text
  })
  return texts
}

/** The same messages with each visited text replaced, in order, by the next of `replacements`. */
export function withMessageTexts(
  messages: readonly ModelMessage[],
  replacements: readonly string[],
): ModelMessage[] {
  let next = 0
  return mapMessageTexts(messages, (text) => replacements[next++] ?? text)
}
