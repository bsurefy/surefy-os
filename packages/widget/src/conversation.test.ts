// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest'

import {
  loadConversation,
  messagesToSend,
  saveConversation,
  storageKeyOf,
  type AnswerEntry,
  type Entry,
} from './conversation.js'
import { MESSAGES_MAX } from './protocol.js'
import { TOKEN } from './test/fakeServer.js'

const answer = (text: string, state: AnswerEntry['state'] = 'done'): AnswerEntry => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  text,
  sources: [],
  state,
  errorCode: null,
  runId: null,
  lastEventId: null,
})
const visitor = (text: string): Entry => ({ id: crypto.randomUUID(), role: 'user', text })

describe('conversation', () => {
  it('stores the conversation per token without keeping the whole token', () => {
    const key = storageKeyOf(TOKEN)
    expect(key).toBe('surefy-widget:wt_a1B2c3D4')
    const state = { conversationId: 'c-1', entries: [visitor('Hi'), answer('Hello')] }
    saveConversation(sessionStorage, key, state)
    expect(loadConversation(sessionStorage, key)).toEqual(state)
  })

  it('starts over when the stored value is damaged or storage is blocked', () => {
    sessionStorage.setItem('bad', '{"conversationId":1}')
    expect(loadConversation(sessionStorage, 'bad').entries).toEqual([])
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(loadConversation(blocked, 'x').conversationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(loadConversation(null, 'x').entries).toEqual([])
  })

  it('sends finished turns only, leaving failed answers out', () => {
    expect(
      messagesToSend([
        visitor('Hi'),
        answer('', 'failed'),
        visitor('Hello?'),
        answer('', 'streaming'),
      ]),
    ).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'user', text: 'Hello?' },
    ])
  })

  it('keeps the last messages, starting with a visitor message', () => {
    const entries: Entry[] = []
    for (let turn = 0; turn < MESSAGES_MAX; turn += 1)
      entries.push(visitor(`q${String(turn)}`), answer(`a${String(turn)}`))
    entries.push(visitor('last'))
    const sent = messagesToSend(entries)
    expect(sent.length).toBeLessThanOrEqual(MESSAGES_MAX)
    expect(sent[0]?.role).toBe('user')
    expect(sent.at(-1)).toEqual({ role: 'user', text: 'last' })
  })
})
