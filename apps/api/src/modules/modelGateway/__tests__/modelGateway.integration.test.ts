// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ForbiddenError } from '@/core/errors/index.js'
import { vaultCredentials } from '@/database/tables/index.js'
import { credentialDtoSchema, ERROR_CODES, vaultModelDtoSchema } from '@surefy/contracts'

import { testKey } from '../../../../test/fixtures/fakeAi.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectPage, request } from '../../../../test/helpers/request.js'
import { createModelGatewayModule } from '../index.js'

import type { ModelCallContext, ModelCallRecord } from '../index.js'

const vault = (orgId: string, path: string) => `/api/v1/orgs/${orgId}/vault${path}`

/** The gateway over the test app's container, with a metering recorder the test can read. */
function gatewayOf(setup: TwoOrgSetup) {
  const records: ModelCallRecord[] = []
  const { container } = setup
  const modules = container.modules
  const gateway = createModelGatewayModule({
    db: container.db,
    logger: container.logger,
    crypto: modules.vault.crypto,
    ai: container.integrations.ai,
    vault: modules.vault,
    models: modules.vault.grants,
    access: modules.access.service,
    hooks: container.hooks,
    usage: {
      record: (record) => {
        records.push(record)
        return Promise.resolve()
      },
    },
  }).service
  return { gateway, records }
}

const adminCall = (
  setup: TwoOrgSetup,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  payload?: unknown,
) =>
  request(setup.app, method, vault(setup.a.id, path), {
    headers: setup.sessionOf(setup.a.members.adam),
    ...(payload === undefined ? {} : { payload }),
  })

/** A local server with its first model enabled; returns the model key. */
async function localModel(setup: TwoOrgSetup, host: string): Promise<string> {
  const server = expectData(
    await adminCall(setup, 'POST', '/local-servers', {
      scope: 'organization',
      name: `Server ${host}`,
      providerKey: 'ollama',
      baseUrl: `http://${host}:11434`,
    }),
    201,
    credentialDtoSchema,
  )
  const [model] = expectPage(
    await adminCall(setup, 'GET', `/models?serverId=${server.id}`),
    vaultModelDtoSchema,
  ).data
  if (!model) throw new Error('the server lists models')
  expectData(
    await adminCall(setup, 'PATCH', `/models/${model.id}`, { isEnabled: true }),
    200,
    vaultModelDtoSchema,
  )
  return model.modelKey
}

/** An organization proxy key (OpenAI-compatible) with its first model enabled; returns its key. */
async function proxyModel(setup: TwoOrgSetup, secret: string): Promise<string> {
  expectData(
    await adminCall(setup, 'POST', '/credentials', {
      scope: 'organization',
      name: 'Proxy',
      providerKey: 'openai_compatible',
      secret,
      baseUrl: 'https://llm-proxy.acme.test/v1',
    }),
    201,
    credentialDtoSchema,
  )
  const [model] = expectPage(
    await adminCall(setup, 'GET', '/models?providerKey=openai_compatible'),
    vaultModelDtoSchema,
  ).data
  if (!model) throw new Error('the proxy lists models')
  if (!model.isEnabled) {
    expectData(
      await adminCall(setup, 'PATCH', `/models/${model.id}`, { isEnabled: true }),
      200,
      vaultModelDtoSchema,
    )
  }
  return model.modelKey
}

/** What a request context gives the gateway: the person's effective access. */
async function contextOf(
  setup: TwoOrgSetup,
  who: 'adam' | 'uma',
  overrides: Partial<ModelCallContext> = {},
): Promise<ModelCallContext> {
  const member = setup.a.members[who]
  const access = await setup.container.modules.access.service.forMember(setup.a.id, member.id)
  if (access === null) throw new Error('member has access')
  return {
    orgId: setup.a.id,
    userId: member.id,
    teamIds: access.teamIds,
    primaryTeamId: access.primaryTeamId,
    allowedModelIds: access.allowedModelIds,
    caller: 'chat',
    ...overrides,
  }
}

const setFallback = (setup: TwoOrgSetup, order: string[], onProviderError = true) =>
  adminCall(setup, 'PUT', '/settings', {
    fallback: {
      version: 1,
      order,
      onProviderError,
      timeoutSeconds: null,
      privateChatsLocalOnly: true,
    },
  })

describe('the model gateway', () => {
  it('answers with an allowed local model and meters the call', async () => {
    const setup = await setupTwoOrgs()
    const modelKey = await localModel(setup, 'ollama-a.lab.test')
    const { gateway, records } = gatewayOf(setup)
    const answer = await gateway.generateText(await contextOf(setup, 'uma'), {
      modelKey,
      prompt: 'Hi',
    })
    expect(answer.text).toBe(setup.ai.reply)
    expect(answer.call).toMatchObject({
      model: { modelKey, source: 'local' },
      credentialScope: 'local',
      outcome: 'success',
      fallback: null,
      usage: { inputTokens: 12, outputTokens: 6, costMicros: 0 },
    })
    expect(records).toHaveLength(1)
    const [server] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(vaultCredentials).where(eq(vaultCredentials.kind, 'local_server')),
    )
    expect(server?.lastUsedAt).not.toBeNull()
  })

  it('refuses a model the caller may not use, and provider models in a private chat', async () => {
    const setup = await setupTwoOrgs()
    const local = await localModel(setup, 'ollama-a.lab.test')
    const proxy = await proxyModel(setup, 'sk-proxy-org-1111')
    const { gateway } = gatewayOf(setup)
    const ctx = await contextOf(setup, 'uma')
    await expect(
      gateway.generateText({ ...ctx, allowedModelIds: [] }, { modelKey: local, prompt: 'Hi' }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MODEL_NOT_ALLOWED,
    })
    await expect(
      gateway.generateText({ ...ctx, isPrivateChat: true }, { modelKey: proxy, prompt: 'Hi' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.MODEL_NOT_ALLOWED })
    const privately = await gateway.generateText(
      { ...ctx, isPrivateChat: true },
      { modelKey: local, prompt: 'Hi' },
    )
    expect(privately.call.credentialScope).toBe('local')
  })

  it('falls back to the next allowed model when a provider is down, and marks the server', async () => {
    const setup = await setupTwoOrgs()
    const down = await localModel(setup, 'ollama-down.lab.test')
    const up = await localModel(setup, 'ollama-up.lab.test')
    await setFallback(setup, [up])
    setup.ai.failWhen('ollama-down.lab.test', { kind: 'status', status: 503, body: 'overloaded' })
    const { gateway, records } = gatewayOf(setup)
    const answer = await gateway.generateText(await contextOf(setup, 'uma'), {
      modelKey: down,
      prompt: 'Hi',
      maxRetries: 0,
    })
    expect(answer.call.fallback).toMatchObject({
      from: { modelKey: down },
      to: { modelKey: up },
      reason: 'provider_error',
    })
    expect(records.map((r) => r.outcome)).toEqual(['error', 'success'])
    const servers = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(vaultCredentials).where(eq(vaultCredentials.kind, 'local_server')),
    )
    expect(servers.find((s) => s.baseUrl?.includes('down'))).toMatchObject({
      status: 'error',
      statusReasonCode: 'LOCAL_SERVER_UNREACHABLE',
    })
  })

  it('does not fall back when the fallback on provider errors is off', async () => {
    const setup = await setupTwoOrgs()
    const down = await localModel(setup, 'ollama-down.lab.test')
    const up = await localModel(setup, 'ollama-up.lab.test')
    await setFallback(setup, [up], false)
    setup.ai.failWhen('ollama-down.lab.test', { kind: 'status', status: 503, body: 'overloaded' })
    const { gateway } = gatewayOf(setup)
    await expect(
      gateway.generateText(await contextOf(setup, 'uma'), {
        modelKey: down,
        prompt: 'Hi',
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE })
  })

  it('uses the person’s own key in their chats, and the organization key for agents', async () => {
    const setup = await setupTwoOrgs()
    const addKey = async (who: 'adam' | 'uma', path: string, payload: Record<string, unknown>) =>
      expectData(
        await request(setup.app, 'POST', vault(setup.a.id, path), {
          headers: setup.sessionOf(setup.a.members[who]),
          payload: { providerKey: 'openai', ...payload },
        }),
        201,
        credentialDtoSchema,
      )
    await addKey('adam', '/credentials', {
      scope: 'organization',
      name: 'Org',
      secret: testKey('openai-org-1111'),
    })
    await addKey('uma', '/my-credentials', { name: 'Mine', secret: testKey('openai-mine-2222') })
    const { gateway } = gatewayOf(setup)
    const ctx = await contextOf(setup, 'uma')
    const mine = await gateway.generateText(ctx, { modelKey: 'openai/gpt-4.1', prompt: 'Hi' })
    expect(mine.text).toBe(setup.ai.reply)
    expect(mine.call.credentialScope).toBe('personal')
    expect(setup.ai.calls.at(-1)?.headers.get('authorization')).toBe('Bearer sk-openai-mine-2222')
    const agent = await gateway.generateText(
      { ...ctx, caller: 'agent' },
      { modelKey: 'openai/gpt-4.1', prompt: 'Hi' },
    )
    expect(agent.call.credentialScope).toBe('organization')
    expect(setup.ai.calls.at(-1)?.headers.get('authorization')).toBe('Bearer sk-openai-org-1111')
  })

  it('records a rejected key at call time and reports the provider unavailable', async () => {
    const setup = await setupTwoOrgs()
    const modelKey = await proxyModel(setup, 'sk-proxy-org-1111')
    setup.ai.setMode({ kind: 'status', status: 401, body: 'key revoked' })
    const { gateway } = gatewayOf(setup)
    await expect(
      gateway.generateText(await contextOf(setup, 'uma'), {
        modelKey,
        prompt: 'Hi',
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE })
    const [key] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(vaultCredentials).where(eq(vaultCredentials.kind, 'ai_provider')),
    )
    expect(key).toMatchObject({ status: 'error', statusReasonCode: 'VAULT_KEY_INVALID' })
  })

  it('streams, and falls back before the first token when the provider is down', async () => {
    const setup = await setupTwoOrgs()
    const down = await localModel(setup, 'ollama-down.lab.test')
    const up = await localModel(setup, 'ollama-up.lab.test')
    await setFallback(setup, [up])
    const { gateway, records } = gatewayOf(setup)
    const ctx = await contextOf(setup, 'uma')

    const direct = await gateway.streamText(ctx, { modelKey: up, prompt: 'Hi' })
    expect(await direct.result.text).toBe(setup.ai.reply)
    expect(await direct.call).toMatchObject({
      outcome: 'success',
      usage: { inputTokens: 12, outputTokens: 6 },
    })

    setup.ai.failWhen('ollama-down.lab.test', { kind: 'status', status: 503, body: 'overloaded' })
    const fallen = await gateway.streamText(ctx, { modelKey: down, prompt: 'Hi', maxRetries: 0 })
    expect(fallen.model.modelKey).toBe(up)
    expect(fallen.fallback).toMatchObject({ from: { modelKey: down }, reason: 'provider_error' })
    let streamed = ''
    for await (const part of fallen.result.textStream) streamed += part
    expect(streamed).toBe(setup.ai.reply)
    expect((await fallen.call).outcome).toBe('success')
    expect(records.map((r) => r.outcome)).toEqual(['success', 'error', 'success'])
  })

  it('embeds with the organization embedding model', async () => {
    const setup = await setupTwoOrgs()
    expectData(
      await adminCall(setup, 'POST', '/credentials', {
        scope: 'organization',
        name: 'OpenAI',
        providerKey: 'openai',
        secret: testKey('openai-org-3333'),
      }),
      201,
      credentialDtoSchema,
    )
    const { gateway } = gatewayOf(setup)
    const result = await gateway.embedMany(await contextOf(setup, 'uma', { caller: 'knowledge' }), {
      modelKey: 'openai/text-embedding-3-small',
      values: ['first chunk', 'second chunk'],
    })
    expect(result.embeddings).toHaveLength(2)
    expect(result.embeddings[0]).toHaveLength(1536)
    expect(result.call).toMatchObject({ outcome: 'success', usage: { inputTokens: 8 } })
  })

  it('lets a call guard block a call, metered as blocked', async () => {
    const setup = await setupTwoOrgs()
    const modelKey = await localModel(setup, 'ollama-a.lab.test')
    setup.container.hooks.addModelCallGuard({
      name: 'test-budget',
      check: () => Promise.reject(new ForbiddenError(ERROR_CODES.LIMIT_REACHED, 'Budget reached')),
    })
    const { gateway, records } = gatewayOf(setup)
    await expect(
      gateway.generateText(await contextOf(setup, 'uma'), { modelKey, prompt: 'Hi' }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.LIMIT_REACHED,
    })
    expect(records.map((r) => r.outcome)).toEqual(['blocked'])
  })

  describe('decision mode', () => {
    const answer = (value: unknown, confidencePercent: number, reasoning = 'Because.') =>
      JSON.stringify({ value, confidencePercent, reasoning })

    it('returns the value, a 0 to 1 confidence and the reasoning, metered as a decision', async () => {
      const setup = await setupTwoOrgs()
      const modelKey = await localModel(setup, 'ollama-a.lab.test')
      const { gateway, records } = gatewayOf(setup)
      setup.ai.reply = answer('billing', 88, 'It is about an invoice.')
      const decision = await gateway.decide(await contextOf(setup, 'uma', { caller: 'agent' }), {
        modelKey,
        question: 'Which team should handle this message?',
        options: ['billing', 'support', 'sales'],
        input: 'My invoice is wrong.',
      })
      expect(decision).toMatchObject({
        value: 'billing',
        confidence: 0.88,
        reasoning: 'It is about an invoice.',
        call: { outcome: 'success', usage: { inputTokens: 12, outputTokens: 6 } },
      })
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ kind: 'decision', outcome: 'success' })
      const sent = JSON.stringify(setup.ai.calls.at(-1)?.body)
      expect(sent).toContain('My invoice is wrong.')
      expect(sent).toContain('\\"enum\\":[\\"billing\\",\\"support\\",\\"sales\\"]')
    })

    it('answers yes or no without options, and keeps confidence inside 0 to 1', async () => {
      const setup = await setupTwoOrgs()
      const modelKey = await localModel(setup, 'ollama-a.lab.test')
      const { gateway } = gatewayOf(setup)
      const ctx = await contextOf(setup, 'uma')
      setup.ai.reply = answer(true, 140)
      const sure = await gateway.decide(ctx, {
        modelKey,
        question: 'Is this urgent?',
        input: 'Server is down.',
      })
      expect(sure).toMatchObject({ value: true, confidence: 1 })
      setup.ai.reply = answer(false, -5)
      const unsure = await gateway.decide(ctx, {
        modelKey,
        question: 'Is this urgent?',
        input: 'Hello.',
      })
      expect(unsure).toMatchObject({ value: false, confidence: 0 })
    })

    it('holds a score to the caller’s schema', async () => {
      const setup = await setupTwoOrgs()
      const modelKey = await localModel(setup, 'ollama-a.lab.test')
      const { gateway } = gatewayOf(setup)
      const ctx = await contextOf(setup, 'uma')
      const request = {
        modelKey,
        question: 'How risky is this action, 1 to 5?',
        input: 'Delete all customers.',
        schema: z.number().int().min(1).max(5),
      }
      setup.ai.reply = answer(5, 93)
      expect(await gateway.decide(ctx, request)).toMatchObject({ value: 5, confidence: 0.93 })
      setup.ai.reply = answer(9, 93)
      await expect(gateway.decide(ctx, request)).rejects.toMatchObject({
        code: ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE,
      })
    })

    it('fails, metered with its tokens, when the model does not answer in the format', async () => {
      const setup = await setupTwoOrgs()
      const modelKey = await localModel(setup, 'ollama-a.lab.test')
      const { gateway, records } = gatewayOf(setup)
      const ctx = await contextOf(setup, 'uma')
      const request = {
        modelKey,
        question: 'Which team?',
        options: ['billing', 'support'],
        input: 'Hi',
      }
      for (const reply of ['I think billing.', answer('sales', 90)]) {
        setup.ai.reply = reply
        await expect(gateway.decide(ctx, request)).rejects.toMatchObject({
          code: ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE,
          options: { details: [{ reasonCode: 'DECISION_OUTPUT_INVALID' }] },
        })
      }
      expect(records.map((r) => [r.kind, r.outcome, r.result.usage.inputTokens])).toEqual([
        ['decision', 'error', 12],
        ['decision', 'error', 12],
      ])
    })

    it('applies the same access rules and guards as any call', async () => {
      const setup = await setupTwoOrgs()
      const modelKey = await localModel(setup, 'ollama-a.lab.test')
      const { gateway, records } = gatewayOf(setup)
      const ctx = await contextOf(setup, 'uma')
      const request = { modelKey, question: 'Is this urgent?', input: 'Hello.' }
      await expect(gateway.decide({ ...ctx, allowedModelIds: [] }, request)).rejects.toMatchObject({
        code: ERROR_CODES.MODEL_NOT_ALLOWED,
      })
      setup.container.hooks.addModelCallGuard({
        name: 'test-budget',
        check: () =>
          Promise.reject(new ForbiddenError(ERROR_CODES.LIMIT_REACHED, 'Budget reached')),
      })
      await expect(gateway.decide(ctx, request)).rejects.toMatchObject({
        code: ERROR_CODES.LIMIT_REACHED,
      })
      expect(records.map((r) => [r.kind, r.outcome])).toEqual([['decision', 'blocked']])
    })
  })
})
