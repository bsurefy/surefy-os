// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { renderWithProviders } from '@surefy/web-core/testing'

import NoOrganization from './NoOrganization'

describe('NoOrganization', () => {
  it('tells the person to ask for an invite and offers sign out', () => {
    renderWithProviders(<NoOrganization />, { messages: appMessages })
    expect(screen.getByRole('heading', { name: "You're not in an organization yet" })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})
