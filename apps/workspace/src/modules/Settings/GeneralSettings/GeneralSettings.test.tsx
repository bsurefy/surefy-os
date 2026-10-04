// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import GeneralSettings from './GeneralSettings'
import {
  organizationsDomain,
  resetOrganizationsMock,
} from '../../../../mock/handlers/organizations'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))

setupTestServer(...organizationsDomain.handlers)

function renderGeneral() {
  return renderWithProviders(<GeneralSettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
  })
}

beforeEach(() => {
  resetOrganizationsMock()
  replace.mockClear()
})

describe('GeneralSettings', () => {
  it('shows the organization and offers saving only after a change', async () => {
    const { user } = renderGeneral()
    expect(await screen.findByLabelText('Name')).toHaveValue('Acme Logistics')
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), ' Group')
    expect(await screen.findByText('1 unsaved change')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Acme Logistics')
  })

  it('saves a new name', async () => {
    const { user } = renderGeneral()
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Acme Group')
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Settings saved')).toBeVisible()
    expect(screen.getByLabelText('Name')).toHaveValue('Acme Group')
    expect(replace).not.toHaveBeenCalled()
  })

  it('asks before changing the address and moves the page to the new one', async () => {
    const { user } = renderGeneral()
    const slug = await screen.findByLabelText('URL address')
    await user.clear(slug)
    await user.type(slug, 'acme-group')
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(
      await screen.findByRole('heading', { name: 'Change the address to acme-group?' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Change address' }))
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/acme-group/settings/general')
    })
  })

  it('says when the address is taken', async () => {
    const { user } = renderGeneral()
    const slug = await screen.findByLabelText('URL address')
    await user.clear(slug)
    await user.type(slug, 'globex')
    expect(await screen.findByText('This address is taken.')).toBeVisible()
  })
})
