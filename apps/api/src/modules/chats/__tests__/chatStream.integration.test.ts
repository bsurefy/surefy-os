// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { chatMessageCitations, chatMessages, chats } from '@/database/tables/index.js'
import { chatMessageDtoSchema, ERROR_CODES } from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectError, expectPage, request } from '../../../../test/helpers/request.js'
import { CONTINUE_PROMPT } from '../chats.constants.js'
import { createChatsModule } from '../index.js'
import {
  as,
  chunksOf,
  enableProxyModel,
  enableSecondModel,
  getChat,
  lastModelBody,
  orgUrl,
  send,
  startChat,
  tenantOf,
  thread,
} from './chatsTestKit.js'

const submit = (text: string) => ({ trigger: 'submit' as const, text, attachmentIds: [] })

async function setupWithModel(): Promise<{ setup: TwoOrgSetup; modelKey: string }> {
  const setup = await setupTwoOrgs()
  return { setup, modelKey: await enableProxyModel(setup) }
}

describe('POST /chats/:chatId/messages', () => {
  it('streams the answer as a UI message stream and stores it once', async () => {
    const { setup, modelKey } = await setupWithModel()
    const chatId = randomUUID()
    const response = await send(setup, chatId, submit('What is the refund policy?'))
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')

    const chunks = chunksOf(response.body)
    const types = chunks.map((chunk) => chunk.type)
    const [start, ids, model] = chunks
    expect(start?.type).toBe('start')
    expect(ids).toMatchObject({ type: 'data-message' })
    expect(model).toMatchObject({
      type: 'data-model',
      data: { model: { modelKey }, dataLocation: 'provider', fallback: null },
    })
    const idsData = (ids as { data: { userMessageId: string; assistantMessageId: string } }).data
    expect((start as { messageId: string }).messageId).toBe(idsData.assistantMessageId)
    const text = chunks
      .filter((chunk) => chunk.type === 'text-delta')
      .map((chunk) => chunk.delta as string)
      .join('')
    expect(text).toBe(setup.ai.reply)
    // the title comes before the usage, and `finish` is last
    expect(types.indexOf('data-title')).toBeGreaterThan(types.lastIndexOf('text-delta'))
    expect(types.at(-2)).toBe('data-usage')
    expect(types.at(-1)).toBe('finish')
    expect(chunks.at(-2)).toMatchObject({
      data: { inputTokens: 12, outputTokens: 6, reasoningTokens: 0 },
    })

    const [question, answer] = await thread(setup, chatId)
    expect(question).toMatchObject({ id: idsData.userMessageId, role: 'user', status: 'complete' })
    expect(answer).toMatchObject({
      id: idsData.assistantMessageId,
      role: 'assistant',
      status: 'complete',
      modelKey,
      dataLocation: 'provider',
      usage: { inputTokens: 12, outputTokens: 6 },
    })
    expect(answer?.parts.parts).toEqual([{ type: 'text', text: setup.ai.reply }])
    const chat = await getChat(setup, chatId)
    expect(chat).toMatchObject({
      messageCount: 2,
      currentModelKey: modelKey,
      title: 'Hello from the fake provider',
      titleGenerated: true,
    })
    // metered per call, pointing at the answer: the answer and its title
    const events = await setup.db.system('test', (tx) =>
      tx.execute<{ source_module: string; n: string }>(
        sql`select source_module, count(*)::text as n from usage_events
            where source_ref_id = ${idsData.assistantMessageId} group by source_module`,
      ),
    )
    expect(events.rows).toEqual([{ source_module: 'chat', n: '2' }])
  })

  it('sends the earlier messages to the model', async () => {
    const { setup } = await setupWithModel()
    const chatId = await startChat(setup, 'My name is Uma.')
    expect((await send(setup, chatId, submit('What is my name?'))).statusCode).toBe(200)
    const roles = lastModelBody(setup).messages.map((message) => message.role)
    expect(roles).toEqual(['system', 'user', 'assistant', 'user'])
    expect(await thread(setup, chatId)).toHaveLength(4)
    expect((await getChat(setup, chatId)).messageCount).toBe(4)
  })

  it('regenerates the latest answer and edits an earlier message', async () => {
    const { setup } = await setupWithModel()
    const chatId = await startChat(setup, 'First question')
    const [question, answer] = await thread(setup, chatId)
    if (question === undefined || answer === undefined) throw new Error('a thread of two')

    expectError(
      await send(setup, chatId, { trigger: 'regenerate', messageId: question.id }),
      409,
      ERROR_CODES.CHAT_MESSAGE_STATE_INVALID,
    )
    const regenerated = await send(setup, chatId, { trigger: 'regenerate', messageId: answer.id })
    expect(regenerated.statusCode).toBe(200)
    const afterRegenerate = await thread(setup, chatId)
    expect(afterRegenerate.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(afterRegenerate[1]?.id).not.toBe(answer.id) // a replacement, the old one is superseded
    expect(
      (
        await setup.db.tenant(setup.a.id, (tx) =>
          tx.select().from(chatMessages).where(eq(chatMessages.id, answer.id)),
        )
      )[0]?.status,
    ).toBe('superseded')
    expect((await getChat(setup, chatId)).messageCount).toBe(2)

    // edit and resend: the edited message and every later one are superseded
    await send(setup, chatId, submit('Second question'))
    const edited = await send(setup, chatId, {
      trigger: 'edit',
      messageId: question.id,
      text: 'First question, reworded',
      attachmentIds: [],
    })
    expect(edited.statusCode).toBe(200)
    const afterEdit = await thread(setup, chatId)
    expect(afterEdit).toHaveLength(2)
    expect(afterEdit[0]?.parts.parts[0]).toEqual({ type: 'text', text: 'First question, reworded' })
    expect(lastModelBody(setup).messages.map((message) => message.role)).toEqual(['system', 'user'])
    expect((await getChat(setup, chatId)).messageCount).toBe(2)
    expectError(
      await send(setup, chatId, { trigger: 'regenerate', messageId: randomUUID() }),
      404,
      ERROR_CODES.CHAT_MESSAGE_NOT_FOUND,
    )
  })

  it('continues only a stopped answer', async () => {
    const { setup } = await setupWithModel()
    const chatId = await startChat(setup, 'Tell me a story')
    const [, answer] = await thread(setup, chatId)
    if (answer === undefined) throw new Error('an answer')
    expectError(
      await send(setup, chatId, { trigger: 'continue', messageId: answer.id }),
      409,
      ERROR_CODES.CHAT_MESSAGE_STATE_INVALID,
    )
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.update(chatMessages).set({ status: 'stopped' }).where(eq(chatMessages.id, answer.id)),
    )
    const response = await send(setup, chatId, { trigger: 'continue', messageId: answer.id })
    expect(response.statusCode).toBe(200)
    const messages = await thread(setup, chatId)
    expect(messages.map((message) => message.status)).toEqual(['complete', 'stopped', 'complete'])
    const sent = lastModelBody(setup).messages
    expect(sent.at(-1)).toMatchObject({ role: 'user' })
    expect(JSON.stringify(sent.at(-1))).toContain(CONTINUE_PROMPT)
    expect((await getChat(setup, chatId)).messageCount).toBe(3)
  })

  it('marks a model switch on the first answer from the other model', async () => {
    const { setup, modelKey } = await setupWithModel()
    const second = await enableSecondModel(setup)
    const chatId = await startChat(setup, 'Hello')
    await send(setup, chatId, { ...submit('And again'), modelKey: second })
    const [, , , answer] = await thread(setup, chatId)
    expect(answer?.modelKey).toBe(second)
    expect(answer?.parts.parts[0]).toEqual({
      type: 'model-switch',
      fromModelKey: modelKey,
      toModelKey: second,
    })
    expect((await getChat(setup, chatId)).currentModelKey).toBe(second)
  })

  it('keeps the message when the provider is down and answers with the error envelope', async () => {
    const { setup } = await setupWithModel()
    setup.ai.setMode({ kind: 'offline' })
    const chatId = randomUUID()
    expectError(
      await send(setup, chatId, submit('Anyone there?')),
      503,
      ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE,
    )
    const [question, answer] = await thread(setup, chatId)
    expect(question).toMatchObject({ role: 'user', status: 'complete' })
    expect(answer).toMatchObject({
      role: 'assistant',
      status: 'failed',
      errorCode: ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE,
      usage: null,
    })
    // and the next message works once the provider is back
    setup.ai.setMode({ kind: 'ok' })
    expect((await send(setup, chatId, submit('Now?'))).statusCode).toBe(200)
  })

  it('refuses a model the person may not use, and chats of other people', async () => {
    const { setup } = await setupWithModel()
    expectError(
      await send(setup, randomUUID(), {
        ...submit('Hi'),
        modelKey: 'openai_compatible/not-enabled',
      }),
      403,
      ERROR_CODES.MODEL_NOT_ALLOWED,
    )
    const adamsChat = await startChat(setup, 'Adam’s question', {}, 'adam')
    expectError(await send(setup, adamsChat, submit('Hijack')), 404, ERROR_CODES.CHAT_NOT_FOUND)
    expect(await thread(setup, adamsChat, 'adam')).toHaveLength(2)
    expectError(
      await send(setup, randomUUID(), { trigger: 'submit', text: '   ', attachmentIds: [] }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('allows one answer at a time and settles one that stopped streaming', async () => {
    const { setup } = await setupWithModel()
    const chatId = await startChat(setup, 'Hello')
    const stream = (updatedAt: Date) =>
      setup.db.tenant(setup.a.id, async (tx) => {
        const rows = await tx
          .insert(chatMessages)
          .values({
            organizationId: setup.a.id,
            chatId,
            role: 'assistant',
            status: 'streaming',
            parts: { version: 1, parts: [{ type: 'text', text: 'Partial' }] },
            contentText: 'Partial',
            updatedAt,
          })
          .returning({ id: chatMessages.id })
        return rows[0]?.id ?? ''
      })
    await stream(new Date())
    expectError(
      await send(setup, chatId, submit('Again')),
      409,
      ERROR_CODES.CHAT_STREAM_IN_PROGRESS,
    )

    await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .update(chatMessages)
        .set({ updatedAt: new Date(Date.now() - 3 * 60_000) })
        .where(eq(chatMessages.status, 'streaming')),
    )
    // a read of the chat settles it, keeping the partial text
    const settled = (await thread(setup, chatId)).find(
      (message) => message.status === 'interrupted',
    )
    expect(settled?.parts.parts).toEqual([{ type: 'text', text: 'Partial' }])
    expect(settled?.errorCode).toBe('CHAT_STREAM_INTERRUPTED')
    expect((await send(setup, chatId, submit('Again'))).statusCode).toBe(200)
  })

  it('keeps the partial answer as stopped when the client aborts', async () => {
    const { setup } = await setupWithModel()
    const { container } = setup
    const abort = new AbortController()
    const real = container.modules.modelGateway.service
    // abort as soon as the stream has started, before the answer was read
    const chatsModule = createChatsModule({
      db: container.db,
      queues: container.queues,
      logger: container.logger,
      storage: container.integrations.storage,
      encryptionKey: setup.config.crypto.encryptionKey,
      gateway: {
        generateText: (ctx, request) => real.generateText(ctx, request),
        streamText: async (ctx, request) => {
          const started = await real.streamText(ctx, request)
          abort.abort()
          return started
        },
      },
      models: container.modules.vault.grants.modelsRepository,
      parser: { extract: () => Promise.resolve({ text: '', pageCount: null }) },
    })
    const chatId = randomUUID()
    const stream = await chatsModule.stream.send(
      await tenantOf(setup),
      chatId,
      submit('Never mind'),
      abort.signal,
    )
    const reader = stream.getReader()
    for (;;) {
      if ((await reader.read()).done) break
    }
    await chatsModule.stream.drain()
    const [question, answer] = await thread(setup, chatId)
    expect(question?.status).toBe('complete')
    expect(answer?.status).toBe('stopped')
    expect(answer?.parts.parts.at(-1)).toEqual({ type: 'data', name: 'stopped', data: {} })
    expect((await getChat(setup, chatId)).messageCount).toBe(2)
  })

  it('sweeps answers that stopped streaming (maintenance job)', async () => {
    const { setup } = await setupWithModel()
    const chatId = await startChat(setup, 'Hello')
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.insert(chatMessages).values({
        organizationId: setup.a.id,
        chatId,
        role: 'assistant',
        status: 'streaming',
        parts: { version: 1, parts: [] },
        updatedAt: new Date(Date.now() - 5 * 60_000),
      }),
    )
    expect(await setup.container.modules.chats.maintenance.sweepStreams()).toBe(1)
    expect(await setup.container.modules.chats.maintenance.sweepStreams()).toBe(0)
  })
})

describe('answers with sources', () => {
  it('numbers retrieved passages, tells the model about them and stores the citations', async () => {
    const { setup } = await setupWithModel()
    const container = setup.container
    const knowledgeBaseId = randomUUID()
    const documentId = randomUUID()
    const chunkId = randomUUID()
    const requests: { query: string; scope: string }[] = []
    const chatsModule = createChatsModule({
      db: container.db,
      queues: container.queues,
      logger: container.logger,
      storage: container.integrations.storage,
      encryptionKey: setup.config.crypto.encryptionKey,
      gateway: container.modules.modelGateway.service,
      models: container.modules.vault.grants.modelsRepository,
      parser: { extract: () => Promise.resolve({ text: '', pageCount: null }) },
      retrieval: {
        retrieve: (input) => {
          requests.push({ query: input.query, scope: input.scope })
          return Promise.resolve({
            passages: [
              {
                knowledgeBaseId,
                documentId,
                chunkId,
                page: 3,
                title: 'Refund handbook',
                text: 'Annual plans can be refunded within 14 days.',
              },
            ],
            skipped: null,
            processingCount: 2,
          })
        },
        checkSource: () =>
          Promise.resolve({
            status: 'available',
            passage: 'Annual plans…',
            canOpenInKnowledge: true,
          }),
      },
    })
    const ctx = await tenantOf(setup)
    const chatId = randomUUID()
    const stream = await chatsModule.stream.send(
      ctx,
      chatId,
      submit('Can I get a refund?'),
      new AbortController().signal,
    )
    const reader = stream.getReader()
    for (;;) {
      if ((await reader.read()).done) break
    }
    await chatsModule.stream.drain()

    expect(requests).toEqual([{ query: 'Can I get a refund?', scope: 'all' }])
    const system = lastModelBody(setup).messages[0]
    expect(String(system?.content)).toContain('[1] Refund handbook')
    expect(String(system?.content)).toContain('Annual plans can be refunded within 14 days.')

    const [, answer] = await thread(setup, chatId)
    expect(answer?.parts.parts).toEqual([
      expect.objectContaining({
        type: 'source',
        index: 1,
        kind: 'knowledge',
        knowledgeBaseId,
        documentId,
        chunkId,
        page: 3,
        title: 'Refund handbook',
      }),
      { type: 'data', name: 'sources-processing', data: { count: 2 } },
      { type: 'text', text: setup.ai.reply },
    ])
    const citations = await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .select()
        .from(chatMessageCitations)
        .where(eq(chatMessageCitations.messageId, answer?.id ?? '')),
    )
    expect(citations).toMatchObject([
      { rank: 1, knowledgeDocumentId: documentId, chunkId, page: 3 },
    ])

    // the preview asks the retrieval port again for this viewer
    const preview = await chatsModule.messages.sourcePreview(ctx, chatId, answer?.id ?? '', 1)
    expect(preview).toMatchObject({
      status: 'available',
      passage: 'Annual plans…',
      canOpenInKnowledge: true,
      page: 3,
    })
    // knowledge scope "none" skips retrieval
    await container.db.tenant(setup.a.id, (tx) =>
      tx.update(chats).set({ knowledgeScope: 'none' }).where(eq(chats.id, chatId)),
    )
    const again = await chatsModule.stream.send(
      ctx,
      chatId,
      submit('Again?'),
      new AbortController().signal,
    )
    const again2 = again.getReader()
    for (;;) {
      if ((await again2.read()).done) break
    }
    expect(requests).toHaveLength(1)
  })

  it('answers without sources while no knowledge module is connected', async () => {
    const { setup } = await setupWithModel()
    const chatId = await startChat(setup, 'Hello')
    const [, answer] = await thread(setup, chatId)
    expect(answer?.parts.parts.some((part) => part.type === 'source')).toBe(false)
    expectPage(
      await request(setup.app, 'GET', orgUrl(setup, `/chats/${chatId}/messages`), {
        headers: as(setup),
      }),
      chatMessageDtoSchema,
    )
  })
})
