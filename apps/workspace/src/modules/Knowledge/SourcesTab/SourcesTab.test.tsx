// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'
import type { ProviderOptions } from '@surefy/web-core/testing'

import {
  FAQ_SOURCE_ID,
  HELP_CENTER_ID,
  knowledgeDomain,
  LEGACY_NOTES_ID,
  REFUND_SOURCE_ID,
  resetKnowledgeMock,
} from '../../../../mock/handlers/knowledge'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'
import KnowledgeBaseDetail from '../KnowledgeBaseDetail'

let mockParams: { orgSlug: string; kbId: string; tab?: string }

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: vi.fn() }),
}))

const server = setupTestServer(...knowledgeDomain.handlers, ...teamsDomain.handlers)

function renderSources(
  kbId = HELP_CENTER_ID,
  searchParams?: string,
  onUrlUpdate?: ProviderOptions['onUrlUpdate'],
) {
  mockParams = { orgSlug: 'acme', kbId, tab: 'sources' }
  return renderWithProviders(<KnowledgeBaseDetail />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
    searchParams,
    onUrlUpdate,
  })
}

/** Forces a scenario on the mocked POST requests of this test; reads keep working. */
function usePostScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST') request.headers.set('x-mock-scenario', scenario)
  })
}

/** Uploading hashes the file, sends it and refreshes the list, which takes longer than a plain read. */
const UPLOAD_WAIT = { timeout: 5000 }

/** The table row of a source; the same name can also show in the upload list while it uploads. */
const rowOf = (name: string, options?: { timeout: number }) =>
  waitFor(() => {
    const row = screen
      .queryAllByText(name)
      .map((element) => element.closest('tr'))
      .find(Boolean)
    if (!row) throw new Error(`No row for ${name}`)
    return row
  }, options)

const fileInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('No file input')
  return input
}

beforeEach(() => {
  resetKnowledgeMock()
  resetTeamsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.restoreAllMocks()
})

describe('SourcesTab', () => {
  it('lists the sources with their type, size, passages, status and the reason a source failed', async () => {
    renderSources()
    const refund = await rowOf('Refund policy.pdf')
    expect(refund).toHaveTextContent('File')
    expect(refund).toHaveTextContent('1.2 MB')
    expect(refund).toHaveTextContent('3')
    expect(refund).toHaveTextContent('Ready')
    expect(refund).toHaveTextContent('Maya Okafor')

    expect(await rowOf('Onboarding.docx')).toHaveTextContent('Processing')
    expect(await rowOf('Onboarding.docx')).toHaveTextContent('60%')
    expect(await rowOf('Scan 0042.tiff')).toHaveTextContent("This file isn't supported")
    expect(await rowOf('Price list.xlsx')).toHaveTextContent(
      'This file took too long to process · Split it into smaller files',
    )
    const link = await rowOf('help.acme.test')
    expect(link).toHaveTextContent('Link')
    expect(link).toHaveTextContent('https://help.acme.test/faq')
    expect(link).toHaveTextContent('Partly failed')
    expect(link).toHaveTextContent('1 page failed')
    expect(screen.queryByText('Old pricing.pdf')).not.toBeInTheDocument()
  })

  it('counts what needs attention and filters to the failed sources with Show failed', async () => {
    const onUrlUpdate = vi.fn()
    const { user } = renderSources(HELP_CENTER_ID, undefined, onUrlUpdate)
    expect(await screen.findByText('3 sources need attention')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Show failed' }))
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ queryString: '?status=failed' }),
      )
    })
  })

  it('filters by status from the URL and by name', async () => {
    renderSources(HELP_CENTER_ID, '?status=ready')
    expect(await screen.findByText('Refund policy.pdf')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('Scan 0042.tiff')).not.toBeInTheDocument()
    })
  })

  it('searches the sources by name', async () => {
    const { user } = renderSources()
    await screen.findByText('Refund policy.pdf')
    await user.type(screen.getByRole('searchbox', { name: 'Search sources' }), 'price')
    expect(await screen.findByText('Price list.xlsx')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('Refund policy.pdf')).not.toBeInTheDocument()
    })
  })

  it('says so when nothing matches the search', async () => {
    const { user } = renderSources()
    await screen.findByText('Refund policy.pdf')
    await user.type(screen.getByRole('searchbox', { name: 'Search sources' }), 'zzzz')
    expect(await screen.findByText('No sources found')).toBeVisible()
  })

  it('shows the first-time state with the dropzone for a base with no sources', async () => {
    renderSources(LEGACY_NOTES_ID)
    expect(await screen.findByText('Add your first documents')).toBeVisible()
  })

  it('disables adding and says why when the base has no embedding model', async () => {
    renderSources(LEGACY_NOTES_ID)
    expect(
      await screen.findByText('Choose an embedding model before adding documents'),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Vault' })).toHaveAttribute(
      'href',
      '/acme/settings/vault',
    )
    expect(fileInput()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add link' })).toBeDisabled()
  })

  it('uploads a file and shows the new source being processed', async () => {
    const { user } = renderSources()
    await screen.findByText('Refund policy.pdf')
    await user.upload(fileInput(), new File(['hello'], 'Notes.txt', { type: 'text/plain' }))
    const row = await rowOf('Notes.txt', UPLOAD_WAIT)
    expect(row).toHaveTextContent(/Queued|Processing/)
  })

  it('lists a file the dropzone refuses with what to do', async () => {
    renderSources()
    await screen.findByText('Refund policy.pdf')
    fireEvent.change(fileInput(), {
      target: { files: [new File(['x'], 'archive.zip', { type: 'application/zip' })] },
    })
    expect(await screen.findByText(/This file isn't supported · Use PDF, DOCX/)).toBeVisible()
  })

  it('asks what to do with a file that is already there, and keeps both when asked', async () => {
    const { user } = renderSources()
    await screen.findByText('Refund policy.pdf')
    await user.upload(fileInput(), new File(['same bytes'], 'Copy.txt', { type: 'text/plain' }))
    await rowOf('Copy.txt', UPLOAD_WAIT)
    await user.upload(fileInput(), new File(['same bytes'], 'Copy.txt', { type: 'text/plain' }))
    const dialog = await screen.findByRole(
      'dialog',
      { name: 'Already in this knowledge base' },
      UPLOAD_WAIT,
    )
    await user.click(within(dialog).getByRole('button', { name: 'Keep both' }))
    await waitFor(() => {
      expect(screen.getAllByText('Copy.txt')).toHaveLength(2)
    }, UPLOAD_WAIT)
  })

  it('replaces the old copy of a duplicate', async () => {
    const { user } = renderSources()
    await screen.findByText('Refund policy.pdf')
    await user.upload(fileInput(), new File(['same bytes'], 'Copy.txt', { type: 'text/plain' }))
    await rowOf('Copy.txt', UPLOAD_WAIT)
    await user.upload(fileInput(), new File(['same bytes'], 'Copy.txt', { type: 'text/plain' }))
    const dialog = await screen.findByRole(
      'dialog',
      { name: 'Already in this knowledge base' },
      UPLOAD_WAIT,
    )
    await user.click(within(dialog).getByRole('button', { name: 'Replace' }))
    await waitFor(() => {
      expect(screen.getAllByText('Copy.txt')).toHaveLength(1)
    }, UPLOAD_WAIT)
  })

  it('shows the storage limit and keeps the failed file retryable', async () => {
    usePostScenario('limit')
    const { user } = renderSources()
    await screen.findByText('Refund policy.pdf')
    await user.upload(fileInput(), new File(['hello'], 'Big.txt', { type: 'text/plain' }))
    expect(await screen.findByText('Storage limit reached', undefined, UPLOAD_WAIT)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it('explains an unsupported file the server refuses', async () => {
    usePostScenario('unsupported-file')
    const { user } = renderSources()
    await screen.findByText('Refund policy.pdf')
    await user.upload(fileInput(), new File(['hello'], 'Odd.txt', { type: 'text/plain' }))
    expect(
      await screen.findByText(/This file type isn't supported/, undefined, UPLOAD_WAIT),
    ).toBeVisible()
  })

  it('retries a failed source and offers Retry with OCR only for scans', async () => {
    const { user } = renderSources()
    await user.click(await screen.findByRole('button', { name: 'Actions for Price list.xlsx' }))
    expect(screen.queryByRole('menuitem', { name: 'Retry with OCR' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 'Actions for Scan 0042.tiff' }))
    expect(await screen.findByRole('menuitem', { name: 'Retry with OCR' })).toBeVisible()
    await user.click(screen.getByRole('menuitem', { name: 'Retry' }))
    await waitFor(async () => {
      expect(await rowOf('Scan 0042.tiff')).toHaveTextContent(/Queued|Processing/)
    })
  })

  it('syncs a link now', async () => {
    const { user } = renderSources()
    await user.click(await screen.findByRole('button', { name: 'Actions for help.acme.test' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sync now' }))
    expect(await screen.findByText('Syncing help.acme.test')).toBeVisible()
  })

  it('removes a source after the T2 confirmation, naming the 30 days', async () => {
    const { user } = renderSources()
    await user.click(await screen.findByRole('button', { name: 'Actions for Price list.xlsx' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Price list.xlsx?' })
    expect(
      within(dialog).getByText(/Agents won't find this anymore. You can restore it for 30 days./),
    ).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(screen.queryByText('Price list.xlsx')).not.toBeInTheDocument()
    })
  })

  it('re-indexes and removes the selected sources in bulk', async () => {
    const { user } = renderSources()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Scan 0042.tiff' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Price list.xlsx' }))
    expect(screen.getByText('2 selected')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Re-index' }))
    expect(await screen.findByText('2 sources queued for re-indexing')).toBeVisible()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Scan 0042.tiff' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Scan 0042.tiff?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(screen.queryByText('Scan 0042.tiff')).not.toBeInTheDocument()
    })
  })

  it('adds a link with its crawl settings', async () => {
    const { user } = renderSources()
    await user.click(await screen.findByRole('button', { name: 'Add link' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add link' })
    await user.type(within(dialog).getByLabelText('Address'), 'https://docs.acme.test/guide')
    await user.type(within(dialog).getByLabelText(/Skip these paths/), '/blog')
    await user.click(within(dialog).getByRole('button', { name: 'Add link' }))
    expect(await screen.findByText('docs.acme.test')).toBeVisible()
  })

  it('refuses an address that is not a link', async () => {
    const { user } = renderSources()
    await user.click(await screen.findByRole('button', { name: 'Add link' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add link' })
    await user.type(within(dialog).getByLabelText('Address'), 'not a link')
    await user.click(within(dialog).getByRole('button', { name: 'Add link' }))
    expect(await within(dialog).findByText(/valid/i)).toBeVisible()
  })

  it('shows a link that cannot be reached with the reason', async () => {
    usePostScenario('link-unreachable')
    const { user } = renderSources()
    await user.click(await screen.findByRole('button', { name: 'Add link' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add link' })
    await user.type(within(dialog).getByLabelText('Address'), 'https://unreachable.example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Add link' }))
    const row = await rowOf('unreachable.example.com')
    expect(row).toHaveTextContent("Couldn't download the link")
  })

  it('shows an error with Try again when the sources do not load', async () => {
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.endsWith('/sources')) {
        request.headers.set('x-mock-scenario', 'error')
      }
    })
    renderSources()
    expect(await screen.findByText("Sources didn't load")).toBeVisible()
  })
})

describe('Source preview', () => {
  it('shows the text by page with the passages, the usage, who can search and Download', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { user } = renderSources(HELP_CENTER_ID, `?source=${REFUND_SOURCE_ID}`)
    const panel = await screen.findByRole('dialog', { name: 'Refund policy.pdf' })
    expect(await within(panel).findByText('Used in answers')).toBeVisible()
    expect(within(panel).getByText('7 times')).toBeVisible()
    expect(within(panel).getByText(/Support/)).toBeVisible()
    expect(await within(panel).findByRole('region', { name: 'Page 1' })).toBeVisible()
    expect(within(panel).getByTitle('Passage 1')).toHaveTextContent(
      'Customers may cancel an annual plan',
    )
    await user.click(within(panel).getByRole('button', { name: 'Download' }))
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining('storage.acme.test'),
        '_blank',
        'noopener,noreferrer',
      )
    })
  })

  it('lets a link source show each of its documents, with the reason one failed', async () => {
    const { user } = renderSources(HELP_CENTER_ID, `?source=${FAQ_SOURCE_ID}`)
    const panel = await screen.findByRole('dialog', { name: 'help.acme.test' })
    expect(await within(panel).findByRole('button', { name: 'Shipping times' })).toBeVisible()
    await user.click(within(panel).getByRole('button', { name: 'Old promotions' }))
    expect(await within(panel).findByText("Couldn't download the page or file")).toBeVisible()
  })

  it('opens the preview from a row', async () => {
    const { user } = renderSources()
    await user.click(await screen.findByRole('button', { name: 'Actions for Refund policy.pdf' }))
    const link = await screen.findByRole('menuitem', { name: 'Preview' })
    expect(link).toHaveAttribute('href', `?source=${REFUND_SOURCE_ID}`)
  })
})
