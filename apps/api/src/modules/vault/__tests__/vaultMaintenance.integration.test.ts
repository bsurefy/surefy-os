// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { notifications, vaultCredentials, vaultModels } from '@/database/tables/index.js'
import { credentialDtoSchema, vaultModelDtoSchema } from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectPage, request } from '../../../../test/helpers/request.js'

const DAY_MS = 86_400_000

const adminCall = (
  setup: TwoOrgSetup,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  payload?: unknown,
) =>
  request(setup.app, method, `/api/v1/orgs/${setup.a.id}/vault${path}`, {
    headers: setup.sessionOf(setup.a.members.adam),
    ...(payload === undefined ? {} : { payload }),
  })

const addKey = async (setup: TwoOrgSetup, name: string, expiresAt?: Date) =>
  expectData(
    await adminCall(setup, 'POST', '/credentials', {
      scope: 'organization',
      name,
      providerKey: 'openai',
      secret: `sk-${name.toLowerCase().replaceAll(' ', '-')}-1234`,
      ...(expiresAt === undefined ? {} : { expiresAt: expiresAt.toISOString() }),
    }),
    201,
    credentialDtoSchema,
  )

const credential = async (setup: TwoOrgSetup, id: string) => {
  const [row] = await setup.db.tenant(setup.a.id, (tx) =>
    tx.select().from(vaultCredentials).where(eq(vaultCredentials.id, id)),
  )
  return row
}

describe('vault maintenance', () => {
  it('expires keys past their date and warns Admins and Owners once, 14 days before', async () => {
    const setup = await setupTwoOrgs()
    const maintenance = setup.container.modules.vault.maintenance
    const old = await addKey(setup, 'Old key')
    const soon = await addKey(setup, 'Soon key', new Date(Date.now() + 5 * DAY_MS))
    await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .update(vaultCredentials)
        .set({ expiresAt: new Date(Date.now() - DAY_MS) })
        .where(eq(vaultCredentials.id, old.id)),
    )

    expect(await maintenance.expireAndWarn()).toEqual({ expired: 1, warned: 2 })
    expect(await credential(setup, old.id)).toMatchObject({ status: 'expired' })
    const sent = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(notifications).where(eq(notifications.type, 'vault_key.expiring')),
    )
    expect(sent.map((n) => n.userId).sort((x, y) => x.localeCompare(y))).toEqual(
      [setup.a.members.olivia.id, setup.a.members.adam.id].sort((x, y) => x.localeCompare(y)),
    )
    expect(sent.every((n) => n.targetId === soon.id)).toBe(true)

    // a second run tells nobody twice
    await maintenance.expireAndWarn()
    const again = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(notifications).where(eq(notifications.type, 'vault_key.expiring')),
    )
    expect(again).toHaveLength(2)
  })

  it('syncs the models daily: listed ones come back, unlisted ones are marked removed', async () => {
    const setup = await setupTwoOrgs()
    await addKey(setup, 'OpenAI')
    await setup.db.tenant(setup.a.id, async (tx) => {
      await tx
        .update(vaultModels)
        .set({ status: 'unavailable' })
        .where(
          and(
            eq(vaultModels.organizationId, setup.a.id),
            eq(vaultModels.modelKey, 'openai/gpt-4.1'),
          ),
        )
      await tx.insert(vaultModels).values({
        organizationId: setup.a.id,
        modelKey: 'openai/gpt-retired',
        providerKey: 'openai',
        providerModelId: 'gpt-retired',
        displayName: 'GPT Retired',
        type: 'chat',
        source: 'provider',
        isEnabled: true,
      })
    })
    expect(await setup.container.modules.vault.maintenance.syncAll()).toEqual({
      organizations: 1,
      failed: 0,
    })
    const models = expectPage(await adminCall(setup, 'GET', '/models'), vaultModelDtoSchema).data
    expect(models.find((m) => m.modelKey === 'openai/gpt-4.1')?.status).toBe('available')
    expect(models.find((m) => m.modelKey === 'openai/gpt-retired')?.status).toBe('removed_upstream')
  })

  it('checks local servers serving enabled models, and their models follow', async () => {
    const setup = await setupTwoOrgs()
    const maintenance = setup.container.modules.vault.maintenance
    const server = expectData(
      await adminCall(setup, 'POST', '/local-servers', {
        scope: 'organization',
        name: 'Lab',
        providerKey: 'ollama',
        baseUrl: 'http://ollama-lab.test:11434',
      }),
      201,
      credentialDtoSchema,
    )
    // no enabled model yet: nothing to check
    expect(await maintenance.checkServers()).toEqual({ checked: 0, down: 0 })
    const [model] = expectPage(
      await adminCall(setup, 'GET', `/models?serverId=${server.id}`),
      vaultModelDtoSchema,
    ).data
    if (!model) throw new Error('the server lists models')
    await adminCall(setup, 'PATCH', `/models/${model.id}`, { isEnabled: true })

    setup.ai.setMode({ kind: 'offline' })
    expect(await maintenance.checkServers()).toEqual({ checked: 1, down: 1 })
    expect(await credential(setup, server.id)).toMatchObject({
      status: 'error',
      statusReasonCode: 'LOCAL_SERVER_UNREACHABLE',
    })
    const offline = expectPage(
      await adminCall(setup, 'GET', `/models?serverId=${server.id}`),
      vaultModelDtoSchema,
    ).data
    expect(offline.every((m) => m.status === 'unavailable')).toBe(true)

    setup.ai.setMode({ kind: 'ok' })
    expect(await maintenance.checkServers()).toEqual({ checked: 1, down: 0 })
    expect(await credential(setup, server.id)).toMatchObject({
      status: 'active',
      statusReasonCode: null,
    })
    const back = expectPage(
      await adminCall(setup, 'GET', `/models?serverId=${server.id}`),
      vaultModelDtoSchema,
    ).data
    expect(back.every((m) => m.status === 'available')).toBe(true)
  })
})
