// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { InvitationPreviewDto } from '@surefy/contracts'

import { getInvitationErrorState, isSameEmail } from './AcceptInvitation.utils'

const invitation: InvitationPreviewDto = {
  organization: { name: 'Acme', slug: 'acme', logoUrl: null },
  role: 'builder',
  email: 'omar@acme.test',
  inviterName: 'Maya Okafor',
  status: 'pending',
  expiresAt: '2026-10-11T10:00:00.000Z',
  requiresTwoFactor: false,
}

describe('getInvitationErrorState', () => {
  it('is null for a pending invitation', () => {
    expect(getInvitationErrorState(invitation)).toBeNull()
  })

  it('names why a link cannot be used', () => {
    expect(getInvitationErrorState(null)).toBe('notFound')
    expect(getInvitationErrorState({ ...invitation, status: 'expired' })).toBe('expired')
    expect(getInvitationErrorState({ ...invitation, status: 'revoked' })).toBe('revoked')
    expect(getInvitationErrorState({ ...invitation, status: 'accepted' })).toBe('accepted')
  })
})

describe('isSameEmail', () => {
  it('ignores case and surrounding spaces', () => {
    expect(isSameEmail(' Omar@Acme.test', 'omar@acme.test')).toBe(true)
    expect(isSameEmail('omar@acme.test', 'maya@acme.test')).toBe(false)
  })
})
