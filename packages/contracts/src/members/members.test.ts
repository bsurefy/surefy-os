// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  bulkMemberActionInputSchema,
  createInvitationInputSchema,
  FILTER_VALUES_MAX,
  invitationTokenParamsSchema,
  listMembersQuerySchema,
  MEMBERS_MAX_PER_BULK_ACTION,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'

describe('members schemas', () => {
  it('turns one or repeated filter values into an array', () => {
    expect(listMembersQuerySchema.parse({ role: 'admin' }).role).toEqual(['admin'])
    expect(listMembersQuerySchema.parse({ status: ['active', 'deactivated'] }).status).toEqual([
      'active',
      'deactivated',
    ])
    expect(listMembersQuerySchema.parse({}).role).toBeUndefined()
    expect(
      listMembersQuerySchema.safeParse({
        role: Array.from({ length: FILTER_VALUES_MAX + 1 }, () => 'user'),
      }).success,
    ).toBe(false)
  })

  it('applies the page defaults and the sort allow-list', () => {
    expect(listMembersQuerySchema.parse({ limit: '10', sort: '-lastActiveAt' })).toMatchObject({
      limit: 10,
      sort: '-lastActiveAt',
    })
    expect(listMembersQuerySchema.safeParse({ sort: 'email' }).success).toBe(false)
  })

  it('checks the fields each bulk action needs', () => {
    expect(
      bulkMemberActionInputSchema.safeParse({
        action: 'change-role',
        memberIds: [id],
        role: 'admin',
      }).success,
    ).toBe(true)
    expect(
      bulkMemberActionInputSchema.safeParse({ action: 'add-to-team', memberIds: [id] }).success,
    ).toBe(false)
    expect(
      bulkMemberActionInputSchema.safeParse({
        action: 'deactivate',
        memberIds: Array.from({ length: MEMBERS_MAX_PER_BULK_ACTION + 1 }, () => id),
      }).success,
    ).toBe(false)
  })

  it('normalizes the invited email and defaults the teams', () => {
    expect(createInvitationInputSchema.parse({ email: 'Bo@Example.test', role: 'user' })).toEqual({
      email: 'bo@example.test',
      role: 'user',
      teamIds: [],
    })
  })

  it('accepts only well-formed invitation tokens', () => {
    expect(invitationTokenParamsSchema.safeParse({ token: 'a'.repeat(43) }).success).toBe(true)
    expect(invitationTokenParamsSchema.safeParse({ token: 'a'.repeat(42) }).success).toBe(false)
    expect(invitationTokenParamsSchema.safeParse({ token: `${'a'.repeat(42)}/` }).success).toBe(
      false,
    )
  })
})
