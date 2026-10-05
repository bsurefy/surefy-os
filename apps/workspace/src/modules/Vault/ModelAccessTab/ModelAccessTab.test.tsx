// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ModelAccessTab from './ModelAccessTab'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { modelsDomain, resetModelsMock } from '../../../../mock/handlers/models'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(
  ...modelsDomain.handlers,
  ...teamsDomain.handlers,
  ...membersDomain.handlers,
)

function renderAccess() {
  return renderWithProviders(<ModelAccessTab />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

afterEach(() => {
  server.events.removeAllListeners()
})

beforeEach(() => {
  resetModelsMock()
  resetTeamsMock()
  resetMembersMock()
})

describe('ModelAccessTab', () => {
  it('lists each model with who may use it', async () => {
    renderAccess()
    const table = await screen.findByRole('table', { name: 'Model access' })
    const gpt = (await within(table).findByText('GPT-4.1')).closest('tr')
    expect(gpt).toHaveTextContent('Everyone in the organization')
    const claude = within(table).getByText('Claude Sonnet 4').closest('tr')
    expect(claude).toHaveTextContent('Support')
    expect(within(table).getByText('nomic-embed-text').closest('tr')).toHaveTextContent('Disabled')
  })

  it('shows the embedding model and warns when there is none', async () => {
    renderAccess()
    expect(await screen.findByRole('combobox', { name: 'Embedding model' })).toHaveTextContent(
      'Text embedding 3 small',
    )
  })

  it('warns that knowledge uploads need an embedding model', async () => {
    useScenario('no-embedding')
    renderAccess()
    expect(await screen.findByText('Knowledge uploads need an embedding model')).toBeVisible()
  })

  it('gives a team access to a model at once', async () => {
    const { user } = renderAccess()
    const table = await screen.findByRole('table', { name: 'Model access' })
    const row = (await within(table).findByText('Claude Sonnet 4')).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('combobox', { name: 'Who can use Claude Sonnet 4' }))
    await user.click(await screen.findByRole('option', { name: /Sales/ }))
    expect(await screen.findByText('Access to Claude Sonnet 4 was saved')).toBeVisible()
    expect(await within(row).findByText('Sales')).toBeVisible()
  })

  it('asks before taking a team off a model in use', async () => {
    const { user } = renderAccess()
    const table = await screen.findByRole('table', { name: 'Model access' })
    const row = (await within(table).findByText('Claude Sonnet 4')).closest('tr') as HTMLElement
    await user.click(await within(row).findByRole('button', { name: 'Remove Support' }))
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Remove Support from Claude Sonnet 4?',
    })
    expect(await within(confirm).findByText('2 agents')).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Remove access' }))
    expect(await screen.findByText('Support can no longer use Claude Sonnet 4')).toBeVisible()
  })

  it('shows and edits access in the matrix', async () => {
    const { user } = renderAccess()
    await user.click(await screen.findByRole('radio', { name: 'Matrix' }))
    const matrix = await screen.findByRole('table', { name: 'Model access by team' })
    expect(
      await within(matrix).findByRole('button', { name: 'Support can use Claude Sonnet 4' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(matrix).getByRole('button', { name: 'Sales can use Claude Sonnet 4' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      within(matrix).getByRole('button', { name: 'Sales can use GPT-4.1 because everyone can' }),
    ).toBeDisabled()
    await user.click(within(matrix).getByRole('button', { name: 'Sales can use Claude Sonnet 4' }))
    expect(
      await screen.findByRole('button', { name: 'Sales can use Claude Sonnet 4' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
