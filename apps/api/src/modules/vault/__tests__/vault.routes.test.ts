// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { auditLogs, vaultCredentials } from '@/database/tables/index.js'
import {
  connectionTestDtoSchema,
  credentialDtoSchema,
  effectiveAccessDtoSchema,
  ERROR_CODES,
  localServerSyncDtoSchema,
  modelAccessRuleDtoSchema,
  usableModelDtoSchema,
  vaultModelDtoSchema,
  vaultSettingsDtoSchema,
} from '@surefy/contracts'

import { testKey } from '../../../../test/fixtures/fakeAi.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
  request,
} from '../../../../test/helpers/request.js'

const SECRET = 'sk-proj-test-secret-abcd1234'
const vaultUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}/vault${path}`

type Who = 'olivia' | 'adam' | 'uma'

const call = (
  setup: TwoOrgSetup,
  who: Who,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  payload?: unknown,
) =>
  request(setup.app, method, path.startsWith('/api') ? path : vaultUrl(setup.a.id, path), {
    headers: setup.sessionOf(setup.a.members[who]),
    ...(payload === undefined ? {} : { payload }),
  })

const addOpenAiKey = async (setup: TwoOrgSetup, extra: Record<string, unknown> = {}) =>
  expectData(
    await call(setup, 'adam', 'POST', '/credentials', {
      scope: 'organization',
      name: 'OpenAI production',
      providerKey: 'openai',
      secret: SECRET,
      ...extra,
    }),
    201,
    credentialDtoSchema,
  )

const listModels = async (setup: TwoOrgSetup, query = '') =>
  expectPage(await call(setup, 'adam', 'GET', `/models${query}`), vaultModelDtoSchema).data

const pickerOf = async (setup: TwoOrgSetup, who: Who) =>
  expectPage(
    await call(setup, who, 'GET', `/api/v1/orgs/${setup.a.id}/models`),
    usableModelDtoSchema,
  ).data

describe('provider keys', () => {
  it('stores a key only after its test passes, encrypted, and offers its catalog models to everyone', async () => {
    const setup = await setupTwoOrgs()
    const key = await addOpenAiKey(setup)
    expect(key).toMatchObject({
      kind: 'ai_provider',
      providerKey: 'openai',
      scope: 'organization',
      isPrimary: true,
      status: 'active',
      secretLast4: '1234',
    })
    expect(JSON.stringify(key)).not.toContain(SECRET)

    // the database holds ciphertext, never the key
    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(vaultCredentials).where(eq(vaultCredentials.id, key.id)),
    )
    expect(row?.secretCiphertext?.toString('utf8')).not.toContain(SECRET)
    expect(row?.dataKeyVersion).toBe(1)

    // catalog models start enabled with an organization rule; the User sees them in the picker
    const models = await listModels(setup)
    expect(models.map((m) => m.modelKey).sort((x, y) => x.localeCompare(y))).toEqual([
      'openai/gpt-4.1',
      'openai/gpt-4.1-mini',
      'openai/text-embedding-3-small',
    ])
    expect(models.every((m) => m.isEnabled)).toBe(true)
    const picker = await pickerOf(setup, 'uma')
    expect(picker.find((m) => m.modelKey === 'openai/gpt-4.1')).toMatchObject({
      dataLocation: 'sent_to_provider',
      source: 'provider',
    })

    // the call went out with the key, and the action is audited without the secret
    const listCall = setup.ai.calls.find((c) => c.url.endsWith('/v1/models'))
    expect(listCall?.headers.get('authorization')).toBe(`Bearer ${SECRET}`)
    const entries = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, 'vault_key.added')),
        ),
    )
    expect(entries).toHaveLength(1)
    expect(JSON.stringify(entries)).not.toContain(SECRET)
    expect(JSON.stringify(entries)).not.toContain('1234')
  })

  it('refuses to store a key the provider rejects, and says why', async () => {
    const setup = await setupTwoOrgs()
    setup.ai.setMode({ kind: 'status', status: 401, body: 'invalid key' })
    expectError(
      await call(setup, 'adam', 'POST', '/credentials', {
        scope: 'organization',
        name: 'Bad key',
        providerKey: 'openai',
        secret: SECRET,
      }),
      422,
      ERROR_CODES.VAULT_KEY_INVALID,
    )
    expect(
      expectPage(await call(setup, 'adam', 'GET', '/credentials'), credentialDtoSchema).data,
    ).toEqual([])
  })

  it('answers a failed connection test as a normal result, and warns about a duplicate', async () => {
    const setup = await setupTwoOrgs()
    setup.ai.setMode({
      kind: 'status',
      status: 429,
      body: '{"error":{"code":"insufficient_quota"}}',
    })
    const failed = expectData(
      await call(setup, 'adam', 'POST', '/connection-tests', {
        kind: 'ai_provider',
        providerKey: 'openai',
        secret: SECRET,
      }),
      200,
      connectionTestDtoSchema,
    )
    expect(failed).toMatchObject({ ok: false, reasonCode: 'VAULT_QUOTA_EXCEEDED', models: [] })

    setup.ai.setMode({ kind: 'ok' })
    const stored = await addOpenAiKey(setup)
    const again = expectData(
      await call(setup, 'adam', 'POST', '/connection-tests', {
        kind: 'ai_provider',
        providerKey: 'openai',
        secret: SECRET,
      }),
      200,
      connectionTestDtoSchema,
    )
    expect(again.ok).toBe(true)
    expect(again.duplicateOf).toEqual({ id: stored.id, name: 'OpenAI production' })
    expect(again.models.find((m) => m.providerModelId === 'gpt-4.1')?.inCatalog).toBe(true)
  })

  it('rotates a key: add the replacement, switch traffic, revoke the old one', async () => {
    const setup = await setupTwoOrgs()
    const old = await addOpenAiKey(setup)
    const replacement = await addOpenAiKey(setup, {
      name: 'OpenAI rotated',
      secret: testKey('proj-new-secret-wxyz9876'),
      rotatesCredentialId: old.id,
    })
    expect(replacement).toMatchObject({ isPrimary: false, rotatedFromId: old.id })

    const switched = expectData(
      await call(setup, 'adam', 'POST', `/credentials/${replacement.id}/make-primary`),
      200,
      credentialDtoSchema,
    )
    expect(switched.isPrimary).toBe(true)
    const before = expectData(
      await call(setup, 'adam', 'GET', `/credentials/${old.id}`),
      200,
      credentialDtoSchema,
    )
    expect(before).toMatchObject({
      isPrimary: false,
      status: 'active',
      replacedBy: { id: replacement.id, name: 'OpenAI rotated' },
    })

    const revoked = expectData(
      await call(setup, 'adam', 'POST', `/credentials/${old.id}/revoke`),
      200,
      credentialDtoSchema,
    )
    expect(revoked).toMatchObject({ status: 'revoked', isPrimary: false, secretLast4: '1234' })
    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(vaultCredentials).where(eq(vaultCredentials.id, old.id)),
    )
    expect(row).toMatchObject({
      secretCiphertext: null,
      secretIv: null,
      secretAuthTag: null,
      dataKeyVersion: null,
    })
    expectError(
      await call(setup, 'adam', 'POST', `/credentials/${old.id}/test`),
      409,
      ERROR_CODES.VAULT_CREDENTIAL_REVOKED,
    )
    // the provider keeps a key, so its models stay available
    expect((await listModels(setup)).every((m) => m.status === 'available')).toBe(true)
  })

  it('marks the provider models unavailable once its last key is revoked', async () => {
    const setup = await setupTwoOrgs()
    const key = await addOpenAiKey(setup)
    await call(setup, 'adam', 'POST', `/credentials/${key.id}/revoke`)
    expect((await listModels(setup)).every((m) => m.status === 'unavailable')).toBe(true)
    expect(await pickerOf(setup, 'uma')).toEqual([])
  })

  it('refuses a replacement for another provider or scope', async () => {
    const setup = await setupTwoOrgs()
    const old = await addOpenAiKey(setup)
    expectError(
      await call(setup, 'adam', 'POST', '/credentials', {
        scope: 'organization',
        name: 'Wrong provider',
        providerKey: 'anthropic',
        secret: SECRET,
        rotatesCredentialId: old.id,
      }),
      422,
      ERROR_CODES.VAULT_ROTATION_MISMATCH,
    )
  })

  it('records the key health of a stored key when tested', async () => {
    const setup = await setupTwoOrgs()
    const key = await addOpenAiKey(setup)
    setup.ai.setMode({ kind: 'status', status: 401, body: 'revoked upstream' })
    const result = expectData(
      await call(setup, 'adam', 'POST', `/credentials/${key.id}/test`),
      200,
      connectionTestDtoSchema,
    )
    expect(result).toMatchObject({ ok: false, reasonCode: 'VAULT_KEY_INVALID' })
    const after = expectData(
      await call(setup, 'adam', 'GET', `/credentials/${key.id}`),
      200,
      credentialDtoSchema,
    )
    expect(after).toMatchObject({ status: 'error', statusReasonCode: 'VAULT_KEY_INVALID' })
  })
})

describe('personal keys', () => {
  it('lets a person add their own key, kept out of the organization keys table', async () => {
    const setup = await setupTwoOrgs()
    const mine = expectData(
      await call(setup, 'uma', 'POST', '/my-credentials', {
        name: 'My OpenAI',
        providerKey: 'openai',
        secret: SECRET,
      }),
      201,
      credentialDtoSchema,
    )
    expect(mine).toMatchObject({
      scope: 'personal',
      owner: { id: setup.a.members.uma.id },
      secretLast4: '1234',
    })
    expect(
      expectPage(await call(setup, 'uma', 'GET', '/my-credentials'), credentialDtoSchema).data,
    ).toHaveLength(1)
    expect(
      expectPage(await call(setup, 'adam', 'GET', '/credentials'), credentialDtoSchema).data,
    ).toEqual([])
    expectError(
      await call(setup, 'adam', 'GET', `/credentials/${mine.id}`),
      404,
      ERROR_CODES.VAULT_CREDENTIAL_NOT_FOUND,
    )
    // models reachable only through a personal key are not stored for the organization
    expect(await listModels(setup)).toEqual([])
  })

  it('refuses a personal key with its own address, and a test of a server', async () => {
    const setup = await setupTwoOrgs()
    expectError(
      await call(setup, 'uma', 'POST', '/my-credentials', {
        name: 'Proxy',
        providerKey: 'openai',
        secret: SECRET,
        baseUrl: 'http://169.254.169.254/latest',
      }),
      403,
      ERROR_CODES.VAULT_PROVIDER_NOT_ALLOWED,
    )
    expectError(
      await call(setup, 'uma', 'POST', '/connection-tests', {
        kind: 'local_server',
        providerKey: 'ollama',
        baseUrl: 'http://ollama.lab.test:11434',
      }),
      403,
      ERROR_CODES.VAULT_PROVIDER_NOT_ALLOWED,
    )
  })

  it('refuses personal keys when the access policy turns them off', async () => {
    const setup = await setupTwoOrgs()
    const policy = await call(setup, 'olivia', 'PUT', `/api/v1/orgs/${setup.a.id}/access/policy`, {
      version: 1,
      providers: { personalKeys: false },
    })
    expect(policy.statusCode, policy.body).toBe(200)
    expectError(
      await call(setup, 'uma', 'POST', '/my-credentials', {
        name: 'My key',
        providerKey: 'openai',
        secret: SECRET,
      }),
      403,
      ERROR_CODES.VAULT_PERSONAL_KEYS_DISABLED,
    )
  })
})

describe('member removal', () => {
  it('revokes the person’s personal keys with their secrets, audited', async () => {
    const setup = await setupTwoOrgs()
    const mine = expectData(
      await call(setup, 'uma', 'POST', '/my-credentials', {
        name: 'Mine',
        providerKey: 'openai',
        secret: SECRET,
      }),
      201,
      credentialDtoSchema,
    )
    const removed = await call(
      setup,
      'olivia',
      'DELETE',
      `/api/v1/orgs/${setup.a.id}/members/${setup.a.members.uma.memberId}`,
    )
    expect(removed.statusCode, removed.body).toBe(204)
    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(vaultCredentials).where(eq(vaultCredentials.id, mine.id)),
    )
    expect(row).toMatchObject({
      status: 'revoked',
      secretCiphertext: null,
      revokedByUserId: setup.a.members.olivia.id,
    })
    const entries = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, 'vault_key.revoked')),
        ),
    )
    expect(entries.map((e) => e.targetId)).toEqual([mine.id])
  })
})

describe('local servers', () => {
  const addServer = async (setup: TwoOrgSetup) =>
    expectData(
      await call(setup, 'adam', 'POST', '/local-servers', {
        scope: 'organization',
        name: 'Lab Ollama',
        providerKey: 'ollama',
        baseUrl: 'http://ollama.lab.test:11434',
      }),
      201,
      credentialDtoSchema,
    )

  it('stores the detected models disabled; enabling offers them, on the server', async () => {
    const setup = await setupTwoOrgs()
    const server = await addServer(setup)
    expect(server).toMatchObject({ kind: 'local_server', modelCount: 2, secretLast4: null })
    expect(setup.ai.calls.at(-1)?.url).toBe('http://ollama.lab.test:11434/v1/models')
    const models = await listModels(setup, `?serverId=${server.id}`)
    expect(models.map((m) => m.modelKey)).toContain(`local/${server.id}/llama3.1:8b`)
    expect(models.every((m) => !m.isEnabled && m.server?.name === 'Lab Ollama')).toBe(true)
    expect(await pickerOf(setup, 'uma')).toEqual([])

    const llama = models.find((m) => m.providerModelId === 'llama3.1:8b')
    if (!llama) throw new Error('llama is listed')
    expectData(
      await call(setup, 'adam', 'PATCH', `/models/${llama.id}`, { isEnabled: true }),
      200,
      vaultModelDtoSchema,
    )
    expect(await pickerOf(setup, 'uma')).toEqual([
      expect.objectContaining({
        modelKey: llama.modelKey,
        dataLocation: 'on_server',
        costTier: 'free',
      }),
    ])
  })

  it('syncs the server again and removes it with its models', async () => {
    const setup = await setupTwoOrgs()
    const server = await addServer(setup)
    const sync = expectData(
      await call(setup, 'adam', 'POST', `/local-servers/${server.id}/sync`),
      200,
      localServerSyncDtoSchema,
    )
    expect(sync).toMatchObject({ added: 0, removed: 0 })
    setup.ai.setMode({ kind: 'offline' })
    expectError(
      await call(setup, 'adam', 'POST', `/local-servers/${server.id}/sync`),
      422,
      ERROR_CODES.LOCAL_SERVER_UNREACHABLE,
    )
    expect((await listModels(setup)).every((m) => m.status === 'unavailable')).toBe(true)
    expectNoContent(await call(setup, 'adam', 'DELETE', `/local-servers/${server.id}`))
    expect(await listModels(setup)).toEqual([])
  })

  it('refuses a local server when the access policy turns local models off', async () => {
    const setup = await setupTwoOrgs()
    await call(setup, 'olivia', 'PUT', `/api/v1/orgs/${setup.a.id}/access/policy`, {
      version: 1,
      providers: { localModels: false },
    })
    expectError(
      await call(setup, 'adam', 'POST', '/local-servers', {
        scope: 'organization',
        name: 'Lab',
        providerKey: 'ollama',
        baseUrl: 'http://ollama.lab.test:11434',
      }),
      403,
      ERROR_CODES.VAULT_PROVIDER_NOT_ALLOWED,
    )
  })
})

describe('model access and settings', () => {
  it('grants a model to one person only, and effective access follows', async () => {
    const setup = await setupTwoOrgs()
    await addOpenAiKey(setup)
    const gpt = (await listModels(setup)).find((m) => m.modelKey === 'openai/gpt-4.1')
    if (!gpt) throw new Error('gpt-4.1 is listed')
    const rules = expectData(
      await call(setup, 'adam', 'PUT', `/models/${gpt.id}/access`, {
        rules: [{ subjectType: 'user', userId: setup.a.members.adam.id }],
      }),
      200,
      modelAccessRuleDtoSchema.array(),
    )
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ subjectType: 'user', user: { id: setup.a.members.adam.id } })
    expect((await pickerOf(setup, 'uma')).map((m) => m.modelKey)).not.toContain('openai/gpt-4.1')
    expect((await pickerOf(setup, 'adam')).map((m) => m.modelKey)).toContain('openai/gpt-4.1')

    const access = expectData(
      await call(setup, 'uma', 'GET', `/api/v1/orgs/${setup.a.id}/access/me`),
      200,
      effectiveAccessDtoSchema,
    )
    expect(access.allowedModelIds).not.toContain(gpt.id)
  })

  it('takes an enabled embedding model and resolves the fallback order', async () => {
    const setup = await setupTwoOrgs()
    await addOpenAiKey(setup)
    const models = await listModels(setup)
    const embedding = models.find((m) => m.type === 'embedding')
    const chat = models.find((m) => m.modelKey === 'openai/gpt-4.1')
    if (!embedding || !chat) throw new Error('models are listed')
    expectError(
      await call(setup, 'adam', 'PUT', '/settings', { embeddingModelId: chat.id }),
      422,
      ERROR_CODES.MODEL_EMBEDDING_INVALID,
    )
    const settings = expectData(
      await call(setup, 'adam', 'PUT', '/settings', {
        embeddingModelId: embedding.id,
        fallback: {
          version: 1,
          order: ['openai/gpt-4.1-mini', 'local/0191a5f0-0000-7000-8000-000000000000/gone'],
          onProviderError: true,
          timeoutSeconds: 30,
          privateChatsLocalOnly: true,
        },
      }),
      200,
      vaultSettingsDtoSchema,
    )
    expect(settings.embeddingModel).toMatchObject({ id: embedding.id, dimensions: 1536 })
    expect(settings.fallbackEntries.map((e) => e.state)).toEqual(['ready', 'missing'])
  })
})

describe('permissions', () => {
  it('lets a User see their picker but not the keys, and only Admins change anything', async () => {
    const setup = await setupTwoOrgs()
    expectError(await call(setup, 'uma', 'GET', '/credentials'), 403, ERROR_CODES.ACCESS_FORBIDDEN)
    expectError(
      await call(setup, 'uma', 'POST', '/credentials', {
        scope: 'organization',
        name: 'x',
        providerKey: 'openai',
        secret: SECRET,
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expect(await pickerOf(setup, 'uma')).toEqual([])
  })
})
