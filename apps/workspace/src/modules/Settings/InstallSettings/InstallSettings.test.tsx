// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { mockPath, mockError, renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import InstallSettings from './InstallSettings'
import { installDomain, resetInstallMock } from '../../../../mock/handlers/install'
import { meDomain } from '../../../../mock/handlers/me'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'

const server = setupTestServer(
  ...meDomain.handlers,
  ...installDomain.handlers,
  ...membersDomain.handlers,
  ...teamsDomain.handlers,
)

function renderInstall(features: string[] = []) {
  return renderWithProviders(<InstallSettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('owner', { features: features as never })),
  })
}

beforeEach(() => {
  resetInstallMock()
  resetMembersMock()
  resetTeamsMock()
})

describe('InstallSettings', () => {
  it('counts the organizations against the limit and points to Enterprise', async () => {
    renderInstall()
    expect(await screen.findByText('1 of 1')).toBeVisible()
    expect(
      screen.getByText('Multiple organizations is available in SurefyOS Enterprise.'),
    ).toBeVisible()
    expect(screen.getByText('SurefyOS 1.0.0')).toBeVisible()
  })

  it('hides who can create organizations unless the install may hold several', async () => {
    renderInstall()
    await screen.findByText('Who can sign up')
    expect(screen.queryByText('Who can create organizations')).not.toBeInTheDocument()
  })

  it('shows who can create organizations where multiple organizations are available', async () => {
    renderInstall(['multi-organization'])
    expect(await screen.findByText('Who can create organizations')).toBeVisible()
  })

  it('switches a sign-in method and saves', async () => {
    const { user } = renderInstall()
    const github = await screen.findByRole('switch', { name: /GitHub/ })
    await user.click(github)
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Install settings saved')).toBeVisible()
  })

  it('does not allow a provider that is not configured on the server', async () => {
    renderInstall()
    expect(await screen.findByRole('switch', { name: /Google/ })).toBeDisabled()
  })

  it('saves the mail server, keeps the password hidden, and sends a test email', async () => {
    const { user } = renderInstall()
    await user.type(await screen.findByLabelText('Server'), 'smtp.acme.test')
    await user.type(screen.getByLabelText('Send from'), 'noreply@acme.test')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Save email server' }))
    expect(await screen.findByText('Email server saved')).toBeVisible()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    await user.type(await screen.findByLabelText('Send to'), 'me@acme.test')
    await user.click(screen.getByRole('button', { name: 'Send test email' }))
    expect(await screen.findByText('Test email sent')).toBeVisible()
  })

  it("shows the mail server's refusal when the test fails", async () => {
    server.use(
      http.post(mockPath('/install/smtp/test'), () =>
        mockError(502, 'INSTALL_SMTP_TEST_FAILED', 'Refused'),
      ),
    )
    const { user } = renderInstall()
    await user.type(await screen.findByLabelText('Server'), 'smtp.acme.test')
    await user.type(screen.getByLabelText('Send from'), 'noreply@acme.test')
    await user.click(screen.getByRole('button', { name: 'Save email server' }))
    await user.type(await screen.findByLabelText('Send to'), 'me@acme.test')
    await user.click(screen.getByRole('button', { name: 'Send test email' }))
    expect(await screen.findByText(/accept the test message/i)).toBeVisible()
  })

  it('adds an administrator and will not remove the last one', async () => {
    const { user } = renderInstall()
    const section = (
      await screen.findByRole('heading', { name: 'Install administrators' })
    ).closest('section')
    if (!section) throw new Error('expected the administrators section')
    await user.click(await within(section).findByRole('combobox', { name: 'Add an administrator' }))
    await user.click(await screen.findByRole('option', { name: /Omar Haddad/ }))
    await user.click(within(section).getByRole('button', { name: 'Add administrator' }))
    expect(await screen.findByText('Administrator added')).toBeVisible()
  })
})
