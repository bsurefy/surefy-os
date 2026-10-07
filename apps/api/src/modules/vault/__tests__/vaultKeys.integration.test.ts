// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createCrypto, MasterKeys, newDataKey } from '@/core/crypto/index.js'
import {
  auditLogs,
  installSettings,
  organizationKeys,
  vaultCredentials,
} from '@/database/tables/index.js'
import { INSTALL_DATA_KEY_AAD } from '@/modules/install/index.js'
import { credentialDtoSchema } from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, request } from '../../../../test/helpers/request.js'
import { VaultKeysRepository } from '../vaultKeys.repository.js'
import { VaultKeysService } from '../vaultKeys.service.js'

const SECRET = 'sk-rotation-test-1234'
const NEW_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')

async function addKey(setup: TwoOrgSetup, orgId: string) {
  const owner = orgId === setup.a.id ? setup.a.members.adam : setup.b.members.bea
  return expectData(
    await request(setup.app, 'POST', `/api/v1/orgs/${orgId}/vault/credentials`, {
      headers: setup.sessionOf(owner),
      payload: { scope: 'organization', name: 'OpenAI', providerKey: 'openai', secret: SECRET },
    }),
    201,
    credentialDtoSchema,
  )
}

const keysOf = (setup: TwoOrgSetup, orgId: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(organizationKeys)
      .where(eq(organizationKeys.organizationId, orgId))
      .orderBy(asc(organizationKeys.keyVersion)),
  )

const credentialOf = async (setup: TwoOrgSetup, orgId: string, id: string) => {
  const [row] = await setup.db.system('test', (tx) =>
    tx.select().from(vaultCredentials).where(eq(vaultCredentials.id, id)),
  )
  if (row === undefined) throw new Error(`no credential ${id} in ${orgId}`)
  return row
}

/** The secret as a crypto built from `crypto` reads it. */
const readSecret = (
  setup: TwoOrgSetup,
  crypto: ReturnType<typeof createCrypto>,
  orgId: string,
  row: typeof vaultCredentials.$inferSelect,
) =>
  setup.db.system('test', (tx) =>
    crypto.secrets.decrypt(
      tx,
      { table: 'vault_credentials', id: row.id, organizationId: orgId },
      row,
    ),
  )

const auditActions = (setup: TwoOrgSetup, orgId: string, prefix: string) =>
  setup.db.system('test', async (tx) =>
    (
      await tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.organizationId, orgId))
    )
      .map((row) => row.action)
      .filter((action) => action.startsWith(prefix)),
  )

describe('data key rotation', () => {
  it('rotates one organization, re-encrypts its secrets and deletes the retired key', async () => {
    const setup = await setupTwoOrgs()
    const keys = setup.container.modules.vault.keys
    const crypto = setup.container.modules.vault.crypto
    const a = await addKey(setup, setup.a.id)
    const b = await addKey(setup, setup.b.id)

    expect(await keys.rotate(setup.a.id)).toEqual({ retiredVersion: 1, version: 2 })
    expect((await keysOf(setup, setup.a.id)).map((k) => [k.keyVersion, k.status])).toEqual([
      [1, 'retired'],
      [2, 'active'],
    ])
    // older rows keep their version and stay readable until they are re-encrypted
    const before = await credentialOf(setup, setup.a.id, a.id)
    expect(before.dataKeyVersion).toBe(1)
    expect(await readSecret(setup, crypto, setup.a.id, before)).toBe(SECRET)

    expect(await keys.reencrypt()).toEqual({
      organizations: 1,
      secrets: 1,
      deleted: { [setup.a.id]: [1] },
    })
    const after = await credentialOf(setup, setup.a.id, a.id)
    expect(after.dataKeyVersion).toBe(2)
    expect(after.secretCiphertext).not.toEqual(before.secretCiphertext)
    expect(after.secretFingerprint).toBe(before.secretFingerprint)
    expect(await readSecret(setup, crypto, setup.a.id, after)).toBe(SECRET)
    expect((await keysOf(setup, setup.a.id)).map((k) => [k.keyVersion, k.status])).toEqual([
      [2, 'active'],
    ])
    expect(await auditActions(setup, setup.a.id, 'organization_key.')).toEqual(
      expect.arrayContaining(['organization_key.rotated', 'organization_key.deleted']),
    )

    // the other organization is untouched; a second run has nothing to do
    expect((await credentialOf(setup, setup.b.id, b.id)).dataKeyVersion).toBe(1)
    expect((await keysOf(setup, setup.b.id)).map((k) => k.keyVersion)).toEqual([1])
    expect(await keys.reencrypt()).toEqual({ organizations: 0, secrets: 0, deleted: {} })
  })

  it('re-encrypts across two rotations and deletes both retired keys', async () => {
    const setup = await setupTwoOrgs()
    const keys = setup.container.modules.vault.keys
    const a = await addKey(setup, setup.a.id)
    await keys.rotate(setup.a.id)
    await keys.rotate(setup.a.id)
    const result = await keys.reencrypt(setup.a.id)
    expect(result.secrets).toBe(1)
    expect(result.deleted).toEqual({ [setup.a.id]: [1, 2] })
    expect((await credentialOf(setup, setup.a.id, a.id)).dataKeyVersion).toBe(3)
    expect(await keys.findOrganization(setup.a.slug)).toBe(setup.a.id)
  })
})

describe('master key re-wrap', () => {
  it('re-wraps every data key and the install key, and recomputes the fingerprints', async () => {
    const setup = await setupTwoOrgs()
    const oldKey = setup.config.crypto.encryptionKey
    const a = await addKey(setup, setup.a.id)
    await setup.container.modules.vault.keys.rotate(setup.b.id) // a retired key is re-wrapped too
    const installDataKey = newDataKey()
    const wrapped = new MasterKeys(oldKey).wrap(installDataKey, INSTALL_DATA_KEY_AAD)
    const installKey = {
      dataKeyWrapped: wrapped.ciphertext,
      dataKeyIv: wrapped.iv,
      dataKeyAuthTag: wrapped.authTag,
      dataKeyMasterKeyId: wrapped.masterKeyId,
    }
    // the test cleanup empties the global tables between tests: the row is written here
    await setup.db.global
      .insert(installSettings)
      .values({ id: 1, ...installKey })
      .onConflictDoUpdate({ target: installSettings.id, set: installKey })

    // the operator sets the new ENCRYPTION_KEY and keeps the old one as ENCRYPTION_KEY_PREVIOUS
    const during = createCrypto({
      ...setup.config,
      crypto: { encryptionKey: NEW_MASTER_KEY, previousEncryptionKey: oldKey },
    })
    const keys = new VaultKeysService({
      db: setup.db,
      crypto: during,
      repository: new VaultKeysRepository(),
      audit: setup.container.modules.audit.service,
      logger: setup.container.logger,
    })
    const result = await keys.rewrap()
    expect(result).toMatchObject({ keys: 3, installKey: true }) // A's v1, B's v1 and v2
    expect(result.organizations).toBe(2)
    expect(result.fingerprints).toBe(1)

    // without the previous key, everything reads with the new one alone
    const after = createCrypto({ ...setup.config, crypto: { encryptionKey: NEW_MASTER_KEY } })
    for (const orgId of [setup.a.id, setup.b.id]) {
      for (const key of await keysOf(setup, orgId)) {
        expect(key.masterKeyId).toBe(after.masterKeys.current.id)
      }
    }
    const row = await credentialOf(setup, setup.a.id, a.id)
    expect(await readSecret(setup, after, setup.a.id, row)).toBe(SECRET)
    expect(row.secretFingerprint).toBe(after.secrets.fingerprint(setup.a.id, SECRET))
    const [install] = await setup.db.global
      .select()
      .from(installSettings)
      .where(eq(installSettings.id, 1))
    if (install?.dataKeyWrapped == null || install.dataKeyIv === null) {
      throw new Error('install key missing')
    }
    expect(
      after.masterKeys.unwrap(
        {
          ciphertext: install.dataKeyWrapped,
          iv: install.dataKeyIv,
          authTag: install.dataKeyAuthTag ?? Buffer.alloc(0),
        },
        INSTALL_DATA_KEY_AAD,
        install.dataKeyMasterKeyId ?? '',
      ),
    ).toEqual(installDataKey)
    expect(await auditActions(setup, setup.a.id, 'organization_key.rewrapped')).toHaveLength(1)

    // a second run finds nothing left
    expect(await keys.rewrap()).toEqual({
      organizations: 0,
      keys: 0,
      fingerprints: 0,
      installKey: false,
    })
    expect(
      await setup.db.system('test', (tx) =>
        tx
          .select()
          .from(organizationKeys)
          .where(
            and(
              eq(organizationKeys.organizationId, setup.a.id),
              eq(organizationKeys.status, 'retired'),
            ),
          ),
      ),
    ).toEqual([])
  })
})
