// SPDX-License-Identifier: AGPL-3.0-only
import { getTableConfig, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { enumCheck, lowercaseCheck } from '../checks.js'
import { ENCRYPTED_TABLES, encryptedSecret, id, orgId, timestamps } from '../columns.js'
import {
  catalogReadPolicy,
  memberReadPolicy,
  ownedOrSystemPolicy,
  selfPolicy,
  selfReadPolicy,
  systemOnlyPolicy,
  tenantPolicy,
} from '../policies.js'

const organizations = pgTable('organizations', { id: id() })

describe('policy builders', () => {
  const sample = pgTable('samples', { organizationId: uuid(), userId: uuid(), id: uuid() })

  it('name every policy after its family', () => {
    expect(tenantPolicy('samples', sample.organizationId).name).toBe('samples_tenant_isolation')
    expect(selfReadPolicy('samples', sample.userId).name).toBe('samples_self_read')
    expect(memberReadPolicy(sample.id).name).toBe('organizations_member_read')
    expect(selfPolicy('samples', sample.userId).name).toBe('samples_self_access')
    expect(catalogReadPolicy('samples', sample.organizationId).name).toBe('samples_catalog_read')
    expect(ownedOrSystemPolicy('samples', sample.organizationId).name).toBe(
      'samples_owned_or_system',
    )
    expect(systemOnlyPolicy('samples').name).toBe('samples_system_only')
  })

  it('applies the tenant policy to every role and command', () => {
    const policy = tenantPolicy('samples', sample.organizationId)
    expect(policy.as).toBe('permissive')
    expect(policy.for).toBe('all')
    expect(policy.to).toBeUndefined()
    expect(policy.using).toBeDefined()
    expect(policy.withCheck).toBeDefined()
  })

  it('attaches the policy to the table, which makes drizzle-kit enable RLS on it', () => {
    const teams = pgTable('teams', { id: id(), organizationId: orgId(organizations) }, (t) => [
      tenantPolicy('teams', t.organizationId),
    ])
    const config = getTableConfig(teams)
    expect(config.policies.map((policy) => policy.name)).toEqual(['teams_tenant_isolation'])
  })
})

describe('column helpers', () => {
  it('builds the standard columns (the client maps the keys to snake_case)', () => {
    const table = pgTable('things', {
      id: id(),
      organizationId: orgId(organizations),
      ...timestamps(),
    })
    const config = getTableConfig(table)
    expect(config.columns.map((column) => column.name)).toEqual([
      'id',
      'organizationId',
      'createdAt',
      'updatedAt',
    ])
    expect(config.columns[0]?.primary).toBe(true)
    expect(config.foreignKeys).toHaveLength(1)
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade')
  })

  it('adds the secret columns and registers the table for re-encryption', () => {
    const columns = encryptedSecret({ table: 'vault_credentials' })
    expect(Object.keys(columns)).toEqual([
      'secretCiphertext',
      'secretIv',
      'secretAuthTag',
      'dataKeyVersion',
      'secretLast4',
      'secretFingerprint',
    ])
    expect(Object.keys(encryptedSecret({ table: 'x', prefix: 'token', display: false }))).toEqual([
      'tokenCiphertext',
      'tokenIv',
      'tokenAuthTag',
      'tokenDataKeyVersion',
    ])
    expect(ENCRYPTED_TABLES.has('vault_credentials')).toBe(true)
  })
})

describe('checks', () => {
  const table = pgTable('members', { role: text(), email: text() })

  it('builds an IN check from contract values and refuses unsafe ones', () => {
    expect(enumCheck('members_role_check', table.role, ['owner', 'admin']).name).toBe(
      'members_role_check',
    )
    expect(() => enumCheck('members_role_check', table.role, ["own'er"])).toThrow(/unsafe/)
  })

  it('builds a lowercase check', () => {
    expect(lowercaseCheck('members_email_lower_check', table.email).name).toBe(
      'members_email_lower_check',
    )
  })
})
