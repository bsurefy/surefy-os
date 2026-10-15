// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { chatMessageDtoSchema, ERROR_CODES } from '@surefy/contracts'

import {
  as,
  chunksOf,
  enableProxyModel,
  enableSecondModel,
  getChat,
  orgUrl,
  send,
  startChat,
  thread,
} from './chatsTestKit.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'

const choose = (setup: TwoOrgSetup, chatId: string, messageId: string) =>
  request(setup.app, 'POST', orgUrl(setup, `/chats/${chatId}/messages/${messageId}/choose`), {
    headers: as(setup),
  })

describe('compare', () => {
  it('answers one message with two models and goes on with the chosen answer', async () => {
    const setup = await setupTwoOrgs()
    const modelA = await enableProxyModel(setup)
    const modelB = await enableSecondModel(setup)
    const chatId = await startChat(setup, 'Draft a welcome email', { modelKey: modelA })
    const [question, answerA] = await thread(setup, chatId)
    if (question === undefined || answerA === undefined) throw new Error('a first answer')

    // answer B needs another model than answer A
    expectError(
      await send(setup, chatId, { trigger: 'compare', messageId: question.id, modelKey: modelA }),
      422,
      ERROR_CODES.CHAT_COMPARE_NOT_AVAILABLE,
    )
    const compared = await send(setup, chatId, {
      trigger: 'compare',
      messageId: question.id,
      modelKey: modelB,
    })
    expect(compared.statusCode).toBe(200)
    const ids = chunksOf(compared.body).find((chunk) => chunk.type === 'data-message')
    expect(ids?.data).toMatchObject({ userMessageId: question.id })

    const [, a, b] = await thread(setup, chatId)
    expect(a?.variant?.label).toBe('a')
    expect(b?.variant).toEqual({ groupId: a?.variant?.groupId, label: 'b' })
    expect(b?.modelKey).toBe(modelB)
    // answer B is no model switch: the chat stays on answer A's model until one is chosen
    expect(b?.parts.parts.some((part) => part.type === 'model-switch')).toBe(false)
    expect((await getChat(setup, chatId)).currentModelKey).toBe(modelA)

    // a message is compared once, and the chat waits for a choice
    expectError(
      await send(setup, chatId, { trigger: 'compare', messageId: question.id, modelKey: modelB }),
      409,
      ERROR_CODES.CHAT_MESSAGE_STATE_INVALID,
    )
    expectError(
      await send(setup, chatId, { trigger: 'submit', text: 'Shorter', attachmentIds: [] }),
      409,
      ERROR_CODES.CHAT_COMPARE_UNRESOLVED,
    )
    expectError(
      await choose(setup, chatId, question.id),
      409,
      ERROR_CODES.CHAT_MESSAGE_STATE_INVALID,
    )

    if (b === undefined) throw new Error('answer B')
    const chosen = expectData(await choose(setup, chatId, b.id), 200, chatMessageDtoSchema)
    expect(chosen.id).toBe(b.id)
    expect((await thread(setup, chatId)).map((message) => message.id)).toEqual([question.id, b.id])
    const chat = await getChat(setup, chatId)
    expect([chat.currentModelKey, chat.messageCount]).toEqual([modelB, 2])
    expectError(await choose(setup, chatId, b.id), 409, ERROR_CODES.CHAT_MESSAGE_STATE_INVALID)

    // the chat goes on with answer B's model
    const next = await send(setup, chatId, {
      trigger: 'submit',
      text: 'Shorter',
      attachmentIds: [],
    })
    expect(next.statusCode).toBe(200)
    expect((await thread(setup, chatId)).at(-1)?.modelKey).toBe(modelB)
  })
})
