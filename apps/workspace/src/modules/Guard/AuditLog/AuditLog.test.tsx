// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { FEATURES } from '@surefy/contracts'
import type { Feature } from '@surefy/contracts'
import type { ProviderOptions } from '@surefy/web-core/testing'
import {
  mockOk,
  mockPage,
  mockPath,
  renderWithProviders,
  setupTestServer,
} from '@surefy/web-core/testing'

import AuditLog from './AuditLog'
import {
  auditDomain,
  auditEntryFactory,
  resetAuditMock,
  UNSEALED_ENTRY_ID,
} from '../../../../mock/handlers/audit'
import { dataControlDomain, resetDataControlMock } from '../../../../mock/handlers/dataControl'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'

/** The export dialog polls every 2 seconds while the file is prepared. */
const POLL_WAIT_MS = 4000

const server = setupTestServer(
  ...auditDomain.handlers,
  ...dataControlDomain.handlers,
  ...membersDomain.handlers,
)

function renderAuditLog({
  searchParams,
  features = [],
  onUrlUpdate,
}: {
  searchParams?: string
  features?: Feature[]
  onUrlUpdate?: ProviderOptions['onUrlUpdate']
} = {}) {
  return renderWithProviders(<AuditLog />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin', { features })),
    searchParams,
    onUrlUpdate,
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

beforeEach(() => {
  resetAuditMock()
  resetDataControlMock()
  resetMembersMock()
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.restoreAllMocks()
})

describe('AuditLog', () => {
  it('lists who did what, to which object, with the result, newest first', async () => {
    renderAuditLog()
    const table = await screen.findByRole('table', { name: 'Audit log' })
    expect(within(table).getByRole('columnheader', { name: 'When (UTC)' })).toBeVisible()
    await within(table).findByText('Role changed')
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Role changed')
    expect(rows[1]).toHaveTextContent('Member · Omar Haddad')
    expect(within(table).getByText('Support triage')).toBeVisible()
    // an action from a later module without a label shows as written, with its model
    expect(within(table).getByText('ticket.replied')).toBeVisible()
    expect(within(table).getByText('openai/gpt-5-mini')).toBeVisible()
    expect(within(table).getByText('Denied')).toBeVisible()
    expect(within(table).getByText('SurefyOS')).toBeVisible()
  })

  it('shows the fresh-install state when there are no events', async () => {
    server.use(http.get(mockPath('/orgs/:orgId/audit/entries'), () => mockPage([])))
    renderAuditLog()
    expect(await screen.findByText('No events yet')).toBeVisible()
    expect(
      screen.getByText('Actions and decisions appear here as people use agents and flows.'),
    ).toBeVisible()
  })

  it('narrows the log with the filters in the URL', async () => {
    renderAuditLog({ searchParams: '?result=denied' })
    const table = await screen.findByRole('table', { name: 'Audit log' })
    expect(await within(table).findByText('Install settings updated')).toBeVisible()
    expect(within(table).queryByText('Role changed')).not.toBeInTheDocument()
  })

  it('says when nothing matches, and clears the filters', async () => {
    const onUrlUpdate = vi.fn()
    const { user } = renderAuditLog({ searchParams: '?q=nothing&result=failed', onUrlUpdate })
    expect(await screen.findByText('No matching events')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledWith(expect.objectContaining({ queryString: '' }))
    })
  })

  it('links each row to its entry, keeping the filters', async () => {
    renderAuditLog({ searchParams: '?object=member' })
    const table = await screen.findByRole('table', { name: 'Audit log' })
    await within(table).findByText('Role changed')
    const [link] = within(table).getAllByRole('link')
    expect(link).toHaveAttribute('href', `?object=member&entry=${UNSEALED_ENTRY_ID}`)
  })

  it('opens an entry with its request, signature, chain position and payload', async () => {
    const sealed = auditEntryFactory({ action: 'team.created', targetLabel: 'Support' })
    server.use(http.get(mockPath('/orgs/:orgId/audit/entries/:entryId'), () => mockOk(sealed)))
    renderAuditLog({ searchParams: `?entry=${sealed.id}` })
    const panel = await screen.findByRole('dialog', { name: 'Team created' })
    expect(within(panel).getByText(sealed.id)).toBeVisible()
    expect(within(panel).getByText(sealed.integrity.chainHash ?? '')).toBeVisible()
    expect(
      within(panel).getByText(
        new RegExp(`Chained to the previous entry · position ${String(sealed.integrity.chainSeq)}`),
      ),
    ).toBeVisible()
    expect(within(panel).getByText(sealed.requestId ?? '')).toBeVisible()
    expect(within(panel).getByText(/"version": 1/)).toBeVisible()
  })

  it('shows "Sealing…" for an entry that has not joined the chain yet', async () => {
    renderAuditLog({ searchParams: `?entry=${UNSEALED_ENTRY_ID}` })
    const panel = await screen.findByRole('dialog', { name: 'Role changed' })
    expect(within(panel).getByText('Sealing…')).toBeVisible()
    expect(within(panel).getByText('Joins the chain within about a minute')).toBeVisible()
  })

  it('warns when an entry no longer matches its chain, and keeps the log readable', async () => {
    useScenario('integrity-mismatch')
    const { user } = renderAuditLog()
    expect(await screen.findByText("An audit entry doesn't match its chain")).toBeVisible()
    expect(await screen.findByRole('table', { name: 'Audit log' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'View entry' }))
    expect(await screen.findByRole('dialog', { name: 'Install settings updated' })).toBeVisible()
  })

  it('starts a verification on demand', async () => {
    const { user } = renderAuditLog()
    expect(await screen.findByText(/Chain verified/)).toBeVisible()
    expect(screen.getByText('7 entries sealed')).toBeVisible()
    expect(screen.getByText('1 entry sealing')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Verify now' }))
    expect(await screen.findByText('Verification started')).toBeVisible()
  })

  it('shows the feature-gate card in the export dialog on Community', async () => {
    const { user } = renderAuditLog()
    await user.click(await screen.findByRole('button', { name: 'Export' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export audit log' })
    expect(within(dialog).getByText(/Audit export is part of SurefyOS/)).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: 'Start export' })).not.toBeInTheDocument()
  })

  it('exports the filtered log and downloads it once ready', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { user } = renderAuditLog({
      searchParams: '?result=denied',
      features: [FEATURES.AUDIT_EXPORT],
    })
    await user.click(await screen.findByRole('button', { name: 'Export' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export audit log' })
    expect(within(dialog).getByText('This file contains personal data')).toBeVisible()
    await user.click(within(dialog).getByRole('radio', { name: 'JSON' }))
    await user.click(within(dialog).getByRole('button', { name: 'Start export' }))
    expect(await within(dialog).findByText('Preparing your export…')).toBeVisible()
    expect(
      await within(dialog).findByText('Your export is ready', {}, { timeout: POLL_WAIT_MS }),
    ).toBeVisible()
    expect(within(dialog).getByText('812 entries · 48 kB')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Download' }))
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining('https://files.acme.test/exports/'),
        '_blank',
        'noopener,noreferrer',
      )
    })
  })

  it('offers Retry when the export fails', async () => {
    useScenario('export-failed')
    const { user } = renderAuditLog({ features: [FEATURES.AUDIT_EXPORT] })
    await user.click(await screen.findByRole('button', { name: 'Export' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export audit log' })
    await user.click(within(dialog).getByRole('button', { name: 'Start export' }))
    expect(
      await within(dialog).findByText('The export failed', {}, { timeout: POLL_WAIT_MS }),
    ).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect(await within(dialog).findByText('Preparing your export…')).toBeVisible()
  })
})
