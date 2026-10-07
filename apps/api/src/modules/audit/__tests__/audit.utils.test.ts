// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { canonicalJson, chainHash, entryHash, type HashedAuditFields } from '../audit.utils.js'

const entry: HashedAuditFields = {
  id: '01900000-0000-7000-8000-000000000001',
  organizationId: '01900000-0000-7000-8000-000000000002',
  createdAt: new Date('2026-10-04T10:00:00.123Z'),
  actorType: 'user',
  actorUserId: '01900000-0000-7000-8000-000000000003',
  actorApiKeyId: null,
  actorRefId: null,
  via: 'user',
  accessGrantId: null,
  partnerId: null,
  action: 'team.created',
  targetType: 'team',
  targetId: null,
  outcome: 'success',
  metadata: { version: 1, counts: { members: 2 } },
  reason: null,
  modelKey: null,
  confidence: 0.9,
  requestId: 'req',
}

describe('audit hashing', () => {
  it('sorts keys at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: null }], c: true } })).toBe(
      '{"a":{"c":true,"d":[2,{"y":null,"z":1}]},"b":1}',
    )
  })

  it('hashes the same entry the same way whatever the key order and float width', () => {
    const reordered = { ...entry, metadata: { counts: { members: 2 }, version: 1 as const } }
    expect(entryHash(reordered).equals(entryHash(entry))).toBe(true)
    // `real` stores 0.9 as 0.8999999761581421; both hash alike.
    expect(entryHash({ ...entry, confidence: Math.fround(0.9) }).equals(entryHash(entry))).toBe(
      true,
    )
    expect(entryHash({ ...entry, action: 'team.deleted' }).equals(entryHash(entry))).toBe(false)
  })

  it('chains like audit_seal: sha256(previous || int8send(seq) || entry_hash)', () => {
    const previous = Buffer.alloc(32)
    const hash = entryHash(entry)
    const seq = Buffer.from([0, 0, 0, 0, 0, 0, 0, 1])
    const expected = createHash('sha256')
      .update(Buffer.concat([previous, seq, hash]))
      .digest()
    expect(chainHash(previous, 1, hash).equals(expected)).toBe(true)
  })
})
