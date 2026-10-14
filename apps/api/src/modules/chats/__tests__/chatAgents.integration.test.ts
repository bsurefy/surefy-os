// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { agents, chatMessages, chats } from '@/database/tables/index.js'
import { createAgentRunsAgents } from '@/modules/agentRuns/index.js'
import { createAuthUsers } from '@/modules/auth/index.js'
import { createEmptyAgentDefinition, ERROR_CODES } from '@surefy/contracts'
import type { SendChatMessageInput } from '@surefy/contracts'

import { setupRuns, type RunsSetup } from '../../agentRuns/__tests__/agentRunsTestKit.js'
import { createChatAgentRuns, createChatOrganizations, createChatsModule } from '../index.js'
import { chunksOf, enableProxyModel, tenantOf } from './chatsTestKit.js'

import type { ChatsModule } from '../index.js'
import type { Who } from './chatsTestKit.js'

interface AgentChats {
  setup: RunsSetup
  chats: ChatsModule
  agentId: string
  modelKey: string
}

/** The run engine with a scripted model, and a chats module whose agent answers it writes. */
async function setupAgentChats(): Promise<AgentChats> {
  const holder: { chats?: ChatsModule } = {}
  const setup = await setupRuns(
    {},
    {
      chatAnswers: () => {
        if (holder.chats === undefined) throw new Error('the chats module is built')
        return holder.chats.agentAnswers
      },
    },
  )
  const { container } = setup
  const chatsModule = createChatsModule({
    db: container.db,
    queues: container.queues,
    logger: container.logger,
    storage: container.integrations.storage,
    encryptionKey: setup.config.crypto.encryptionKey,
    gateway: container.modules.modelGateway.service,
    pii: container.modules.guard.piiFilter,
    models: container.modules.vault.grants.modelsRepository,
    parser: { extract: () => Promise.resolve({ text: '', pageCount: null }) },
    agents: createChatAgentRuns({
      agents: createAgentRunsAgents(container.modules.agents.repository),
      runs: setup.runs,
    }),
    organizations: createChatOrganizations(container.modules.organizations.service),
    users: createAuthUsers({ db: container.db, storage: container.integrations.storage }),
    notifications: container.modules.notifications.service,
    audit: container.modules.audit.service,
  })
  holder.chats = chatsModule
  const modelKey = await enableProxyModel(setup)
  const agent = await setup.agent({ model: createEmptyAgentDefinition(modelKey).model })
  return { setup, chats: chatsModule, agentId: agent.id, modelKey }
}

type Submit = Extract<SendChatMessageInput, { trigger: 'submit' }>

const submit = (text: string, extra: Partial<Submit> = {}): Submit => ({
  trigger: 'submit',
  text,
  attachmentIds: [],
  ...extra,
})

/** Sends as a person; the answer must be the run's stream. Returns its first events. */
async function sendToAgent(
  env: AgentChats,
  chatId: string,
  input: SendChatMessageInput,
  options: { who?: Who; head?: number } = {},
): Promise<Record<string, unknown>[]> {
  const sent = await env.chats.stream.send(
    await tenantOf(env.setup, options.who ?? 'olivia'),
    chatId,
    input,
    new AbortController().signal,
  )
  if (sent.kind !== 'response' || sent.response.body === null) throw new Error('a run stream')
  expect(sent.response.headers.get('content-type')).toContain('text/event-stream')
  // the head of the stream is written before the run's own events; then the client goes away
  const reader: ReadableStreamDefaultReader<Uint8Array> = sent.response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  // the head: `start`, `data-message`, then `data-model` and `data-title` when there are any
  while (text.split('\n\n').length <= (options.head ?? 4)) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  await reader.cancel()
  return chunksOf(text.slice(0, text.lastIndexOf('\n\n') + 2))
}

const messagesOf = (env: AgentChats, chatId: string) =>
  env.setup.db.tenant(env.setup.a.id, (tx) =>
    tx
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chatId))
      .orderBy(chatMessages.createdAt, chatMessages.id),
  )

describe('agent chats', () => {
  it('answers with the run, and the run writes the answer when it ends', async () => {
    const env = await setupAgentChats()
    const chatId = randomUUID()
    const head = await sendToAgent(
      env,
      chatId,
      submit('Refund order 1182', { newChat: { agentId: env.agentId } }),
    )

    const [question, answer] = await messagesOf(env, chatId)
    if (question === undefined || answer === undefined) throw new Error('two messages')
    expect(head.map((chunk) => chunk.type)).toEqual([
      'start',
      'data-message',
      'data-model',
      'data-title',
    ])
    expect(head[0]).toEqual({ type: 'start', messageId: answer.id })
    expect(head[1]?.data).toEqual({ userMessageId: question.id, assistantMessageId: answer.id })
    expect(head[2]?.data).toMatchObject({ model: { modelKey: env.modelKey } })
    expect(head[3]?.data).toEqual({ title: 'Refund order 1182' })
    expect(answer).toMatchObject({ role: 'assistant', status: 'streaming', modelKey: env.modelKey })
    const runId = answer.agentRunId
    if (runId === null) throw new Error('the answer names its run')
    const [chat] = await env.setup.db.tenant(env.setup.a.id, (tx) =>
      tx.select().from(chats).where(eq(chats.id, chatId)),
    )
    expect(chat).toMatchObject({
      agentId: env.agentId,
      messageCount: 2,
      title: 'Refund order 1182',
    })
    const ctx = await tenantOf(env.setup, 'olivia')
    expect((await env.chats.service.get(ctx, chatId)).agent).toEqual({
      id: env.agentId,
      name: 'Refund agent',
      isAvailable: true,
    })

    // a waiting run shows its approval card on the answer
    const approvalId = randomUUID()
    await env.setup.db.tenant(env.setup.a.id, (tx) =>
      env.chats.agentAnswers.waiting(tx, env.setup.a.id, runId, [approvalId]),
    )
    expect((await messagesOf(env, chatId))[1]?.parts.parts).toEqual([
      { type: 'data', name: 'approval', data: { approvalId } },
    ])

    env.setup.gateway.scripts.push({ text: 'Refund sent for order 1182.' })
    await env.setup.execute(runId)
    const { run, steps } = await env.setup.read(runId)
    expect(run).toMatchObject({ status: 'succeeded', trigger: 'chat', chatId })
    const input = steps.find((step) => step.seq === 1)?.input
    expect(input?.kind === 'model' ? input.run?.messages : undefined).toEqual([
      { role: 'user', text: 'Refund order 1182' },
    ])

    const written = (await messagesOf(env, chatId))[1]
    expect(written).toMatchObject({
      status: 'complete',
      contentText: 'Refund sent for order 1182.',
      agentRunId: runId,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      errorCode: null,
    })
    expect(written?.parts.parts.at(-1)).toEqual({
      type: 'text',
      text: 'Refund sent for order 1182.',
    })

    // the next message carries the conversation so far
    await sendToAgent(env, chatId, submit('And the shipping fee?'), { head: 3 })
    const next = (await messagesOf(env, chatId))[3]
    if (next?.agentRunId == null) throw new Error('a second run')
    const second = await env.setup.read(next.agentRunId)
    const nextInput = second.steps.find((step) => step.seq === 1)?.input
    expect(nextInput?.kind === 'model' ? nextInput.run?.messages.map((m) => m.role) : []).toEqual([
      'user',
      'assistant',
      'user',
    ])
  })

  it('takes new text messages only, while the person may use the agent', async () => {
    const env = await setupAgentChats()
    const chatId = randomUUID()
    await sendToAgent(env, chatId, submit('Hello', { newChat: { agentId: env.agentId } }))
    const [question, answer] = await messagesOf(env, chatId)
    if (question === undefined || answer?.agentRunId == null) throw new Error('an answer')
    env.setup.gateway.scripts.push({ text: 'Hi.' })
    await env.setup.execute(answer.agentRunId)

    const ctx = await tenantOf(env.setup, 'olivia')
    const signal = new AbortController().signal
    const attempt = (input: SendChatMessageInput, who: Who = 'olivia', id = chatId) =>
      who === 'olivia'
        ? env.chats.stream.send(ctx, id, input, signal)
        : tenantOf(env.setup, who).then((other) => env.chats.stream.send(other, id, input, signal))

    await expect(
      attempt({ trigger: 'compare', messageId: question.id, modelKey: env.modelKey }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHAT_COMPARE_NOT_AVAILABLE })
    await expect(attempt({ trigger: 'regenerate', messageId: answer.id })).rejects.toMatchObject({
      code: ERROR_CODES.CHAT_MESSAGE_STATE_INVALID,
    })
    await expect(attempt(submit('Again', { attachmentIds: [randomUUID()] }))).rejects.toMatchObject(
      {
        code: ERROR_CODES.CHAT_MESSAGE_STATE_INVALID,
      },
    )
    await expect(
      attempt(
        submit('Private', { newChat: { agentId: env.agentId, isPrivate: true } }),
        'olivia',
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHAT_MESSAGE_STATE_INVALID })
    // Uma is not in the agent's audience
    await expect(
      attempt(submit('Hi', { newChat: { agentId: env.agentId } }), 'uma', randomUUID()),
    ).rejects.toMatchObject({ code: ERROR_CODES.AGENT_NOT_FOUND })

    // a paused agent is not available anymore; the history stays
    await env.setup.db.tenant(env.setup.a.id, (tx) =>
      tx.update(agents).set({ status: 'paused' }).where(eq(agents.id, env.agentId)),
    )
    await expect(attempt(submit('Still there?'))).rejects.toMatchObject({
      code: ERROR_CODES.AGENT_PAUSED,
    })
    expect((await env.chats.service.get(ctx, chatId)).agent).toMatchObject({ isAvailable: false })
    expect(await messagesOf(env, chatId)).toHaveLength(2)
  })

  it('stores a failed run as a failed answer with its error code', async () => {
    const env = await setupAgentChats()
    const chatId = randomUUID()
    await sendToAgent(env, chatId, submit('Refund order 7', { newChat: { agentId: env.agentId } }))
    const answer = (await messagesOf(env, chatId))[1]
    if (answer?.agentRunId == null) throw new Error('an answer')
    env.setup.gateway.scripts.push({ error: new Error('provider down') })
    await env.setup.execute(answer.agentRunId, { final: true })
    const { run } = await env.setup.read(answer.agentRunId)
    expect(run.status).toBe('failed')
    expect((await messagesOf(env, chatId))[1]).toMatchObject({
      status: 'failed',
      errorCode: run.errorCode,
    })
  })
})
