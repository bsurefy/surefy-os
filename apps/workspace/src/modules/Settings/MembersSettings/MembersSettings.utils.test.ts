// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  buildMemberRows,
  getRowStatus,
  getSelectedMemberIds,
  isRoleChangeT2,
  parseEmails,
} from './MembersSettings.utils'
import { invitationFactory, memberFactory } from '../../../../mock/handlers/members'

describe('buildMemberRows', () => {
  const members = [memberFactory({ role: 'admin' })]
  const invitations = [
    invitationFactory({ role: 'builder' }),
    invitationFactory({
      role: 'user',
      teams: [{ id: '0191a000-0000-7000-8000-00000000001e', name: 'Support' }],
    }),
  ]

  it('lists invitations before people', () => {
    const rows = buildMemberRows(members, invitations, { status: 'all' })
    expect(rows.map((row) => row.kind)).toEqual(['invitation', 'invitation', 'member'])
  })

  it('shows only invitations under Invited and only people under Active', () => {
    expect(buildMemberRows(members, invitations, { status: 'invited' }).map((r) => r.kind)).toEqual(
      ['invitation', 'invitation'],
    )
    expect(buildMemberRows(members, invitations, { status: 'active' }).map((r) => r.kind)).toEqual([
      'member',
    ])
  })

  it('filters invitations by role and team', () => {
    expect(buildMemberRows([], invitations, { status: 'all', role: 'builder' })).toHaveLength(1)
    expect(
      buildMemberRows([], invitations, {
        status: 'all',
        teamId: '0191a000-0000-7000-8000-00000000001e',
      }),
    ).toHaveLength(1)
  })
})

describe('getSelectedMemberIds', () => {
  it('keeps people and drops invitations', () => {
    expect(
      getSelectedMemberIds({ 'member:a': true, 'invitation:b': true, 'member:c': true }),
    ).toEqual(['a', 'c'])
  })
})

describe('isRoleChangeT2', () => {
  it('asks for confirmation on promotion to Admin or Owner and on any demotion', () => {
    expect(isRoleChangeT2('builder', 'admin')).toBe(true)
    expect(isRoleChangeT2('admin', 'owner')).toBe(true)
    expect(isRoleChangeT2('admin', 'builder')).toBe(true)
    expect(isRoleChangeT2('owner', 'admin')).toBe(true)
  })

  it('changes User to Builder at once and ignores no change', () => {
    expect(isRoleChangeT2('user', 'builder')).toBe(false)
    expect(isRoleChangeT2('user', 'user')).toBe(false)
  })
})

describe('getRowStatus', () => {
  it('tells a failed delivery from a pending invitation', () => {
    const row = (deliveryStatus: 'sent' | 'failed') => ({
      kind: 'invitation' as const,
      id: 'i',
      invitation: invitationFactory({ deliveryStatus }),
    })
    expect(getRowStatus(row('sent'))).toBe('invited')
    expect(getRowStatus(row('failed'))).toBe('notDelivered')
  })
})

describe('parseEmails', () => {
  it('splits on commas, spaces and line breaks, lowercases and removes duplicates', () => {
    expect(parseEmails('A@x.test, b@x.test\nb@x.test;  c@x.test')).toEqual([
      'a@x.test',
      'b@x.test',
      'c@x.test',
    ])
  })
})
