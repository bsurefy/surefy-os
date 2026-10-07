// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { ORG_ID } from '@/test/shell'
import { ERROR_CODES } from '@surefy/contracts'
import type { SetupCheckDto, SetupStatusDto } from '@surefy/contracts'
import {
  mockError,
  mockOk,
  mockPath,
  renderWithProviders,
  setupTestServer,
} from '@surefy/web-core/testing'

import SetupWizard from './SetupWizard'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { teamsDomain } from '../../../../mock/handlers/teams'
import { resetVaultMock, vaultDomain } from '../../../../mock/handlers/vault'

import type { SetupWizardProps } from './SetupWizard.types'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ orgSlug: 'acme' }),
}))

const server = setupTestServer(
  ...vaultDomain.handlers,
  ...teamsDomain.handlers,
  ...membersDomain.handlers,
)

const check = (overrides: Partial<SetupCheckDto>): SetupCheckDto => ({
  key: 'server',
  status: 'ok',
  blocking: true,
  code: null,
  detail: null,
  ...overrides,
})

const healthyChecks: SetupCheckDto[] = [
  check({ key: 'server' }),
  check({ key: 'database' }),
  check({ key: 'storage', blocking: false }),
  check({ key: 'email', blocking: false }),
  check({
    key: 'gpu',
    blocking: false,
    status: 'warning',
    code: 'GPU_NOT_DETECTED',
  }),
]

const openStatus = (overrides: Partial<SetupStatusDto> = {}): SetupStatusDto => ({
  isComplete: false,
  finishedAt: null,
  requiresToken: false,
  checks: healthyChecks,
  ...overrides,
})

function serveStatus(status: SetupStatusDto) {
  server.use(http.get(mockPath('/setup/status'), () => mockOk(status)))
}

const ACME = { id: ORG_ID, name: 'Acme Logistics', slug: 'acme' }

function renderWizard(props: Partial<SetupWizardProps> = {}) {
  return renderWithProviders(<SetupWizard resume={null} {...props} />, { messages: appMessages })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

beforeEach(() => {
  mockPush.mockClear()
  resetVaultMock()
  resetMembersMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('SetupWizard: Welcome', () => {
  it('lists the server checks and lets setup continue past an optional warning', async () => {
    serveStatus(openStatus())
    const { user } = renderWizard()
    expect(await screen.findByRole('heading', { name: 'Welcome to SurefyOS' })).toBeVisible()
    const checks = screen.getByRole('list', { name: 'Server checks' })
    expect(checks).toHaveTextContent('Database')
    expect(checks).toHaveTextContent('No GPU found')
    expect(screen.getByText('Step 1 of 4')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Your organization and owner' })).toBeVisible()
  })

  it('stops on a failed database with the fix, and goes on after "Check again"', async () => {
    serveStatus(
      openStatus({
        checks: [
          check({
            key: 'database',
            status: 'failed',
            code: 'DATABASE_UNREACHABLE',
            detail: 'ECONNREFUSED',
          }),
        ],
      }),
    )
    const { user } = renderWizard()
    expect(await screen.findByText(/The database can't be reached/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    serveStatus(openStatus())
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    })
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
  })

  it('offers a retry when the server does not answer', async () => {
    server.use(
      http.get(mockPath('/setup/status'), () =>
        mockError(503, ERROR_CODES.SERVICE_UNAVAILABLE, 'down'),
      ),
    )
    const { user } = renderWizard()
    expect(await screen.findByText("Can't reach the server")).toBeVisible()
    serveStatus(openStatus())
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Welcome to SurefyOS' })).toBeVisible()
  })
})

describe('SetupWizard: already complete', () => {
  it('says setup is over and links to sign in', async () => {
    serveStatus(
      openStatus({ isComplete: true, finishedAt: '2026-01-02T09:00:00.000Z', checks: [] }),
    )
    renderWizard()
    expect(await screen.findByRole('heading', { name: 'Setup is already complete' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('opens the workspace for someone who is signed in', async () => {
    serveStatus(
      openStatus({ isComplete: true, finishedAt: '2026-01-02T09:00:00.000Z', checks: [] }),
    )
    renderWizard({ resume: ACME })
    expect(await screen.findByRole('link', { name: 'Open your workspace' })).toHaveAttribute(
      'href',
      '/acme/chat',
    )
  })

  it('resumes at the AI model step for an Owner whose setup was left unfinished', async () => {
    serveStatus(openStatus({ isComplete: true, checks: [] }))
    renderWizard({ resume: ACME })
    expect(await screen.findByRole('heading', { name: 'Connect an AI model' })).toBeVisible()
    expect(screen.getByText('Step 3 of 4')).toBeVisible()
  })
})

describe('SetupWizard: Organization and owner', () => {
  async function openOrganizationStep(status: SetupStatusDto = openStatus()) {
    serveStatus(status)
    const view = renderWizard()
    await view.user.click(await screen.findByRole('button', { name: 'Continue' }))
    return view
  }

  const fillOwner = async (user: Awaited<ReturnType<typeof openOrganizationStep>>['user']) => {
    await user.type(screen.getByLabelText('Your name'), 'Maya Okafor')
    await user.type(screen.getByLabelText('Work email'), 'maya@acme.test')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
  }

  it('proposes the URL address from the name until it is edited, and checks it', async () => {
    server.use(
      http.get(mockPath('/organizations/slug-availability'), ({ request }) =>
        mockOk({
          slug: new URL(request.url).searchParams.get('slug'),
          available: false,
          reason: 'taken',
        }),
      ),
    )
    const { user } = await openOrganizationStep()
    await user.type(screen.getByLabelText('Organization name'), 'Acme Logistics')
    const slug = screen.getByLabelText('URL address')
    expect(slug).toHaveValue('acme-logistics')
    expect(await screen.findByText(/This address is taken\./)).toBeVisible()

    await user.clear(slug)
    await user.type(slug, 'acme')
    await user.type(screen.getByLabelText('Organization name'), ' Group')
    expect(slug).toHaveValue('acme')

    await user.clear(slug)
    await user.type(screen.getByLabelText('Organization name'), '!')
    expect(slug).toHaveValue('acme-logistics-group')
  })

  it('creates the organization and the Owner, then moves on to the AI model', async () => {
    let body: unknown
    server.use(
      http.get(mockPath('/organizations/slug-availability'), ({ request }) =>
        mockOk({
          slug: new URL(request.url).searchParams.get('slug'),
          available: true,
          reason: null,
        }),
      ),
      http.post(mockPath('/setup'), async ({ request }) => {
        body = await request.json()
        return mockOk(
          {
            organization: { ...ACME, logoUrl: null, status: 'active' },
            user: {
              id: '0191a000-0000-7000-8000-0000000000aa',
              name: 'Maya Okafor',
              email: 'maya@acme.test',
              emailVerified: true,
              imageUrl: null,
              twoFactorEnabled: false,
              createdAt: '2026-01-02T09:00:00.000Z',
              updatedAt: '2026-01-02T09:00:00.000Z',
            },
          },
          { status: 201 },
        )
      }),
    )
    const { user } = await openOrganizationStep()
    await user.type(screen.getByLabelText('Organization name'), 'Acme Logistics')
    await fillOwner(user)
    await user.click(screen.getByRole('button', { name: 'Create organization' }))

    expect(await screen.findByRole('heading', { name: 'Connect an AI model' })).toBeVisible()
    expect(body).toMatchObject({
      organization: { name: 'Acme Logistics', slug: 'acme-logistics' },
      owner: { name: 'Maya Okafor', email: 'maya@acme.test', password: 'correct horse battery' },
      locale: 'en',
    })
    expect(body).not.toHaveProperty('token')
  })

  it('asks for the setup token when the server has one, and shows a wrong token on the field', async () => {
    server.use(
      http.post(mockPath('/setup'), () =>
        mockError(403, ERROR_CODES.SETUP_TOKEN_INVALID, 'The setup token is missing or wrong'),
      ),
    )
    const { user } = await openOrganizationStep(openStatus({ requiresToken: true }))
    await user.type(screen.getByLabelText('Organization name'), 'Acme')
    await user.type(screen.getByLabelText('Setup token'), 'x'.repeat(24))
    await fillOwner(user)
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    expect(await screen.findByText(/The setup token doesn't match/)).toBeVisible()
  })

  it('does not send a short setup token', async () => {
    const { user } = await openOrganizationStep(openStatus({ requiresToken: true }))
    await user.type(screen.getByLabelText('Organization name'), 'Acme')
    await user.type(screen.getByLabelText('Setup token'), 'short')
    await fillOwner(user)
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    expect(await screen.findByText('The setup token is missing or wrong.')).toBeVisible()
  })

  it('puts a taken address on the URL field', async () => {
    server.use(
      http.post(mockPath('/setup'), () =>
        mockError(409, ERROR_CODES.ORGANIZATION_SLUG_TAKEN, 'taken'),
      ),
    )
    const { user } = await openOrganizationStep()
    await user.type(screen.getByLabelText('Organization name'), 'Acme')
    await fillOwner(user)
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    expect(await screen.findByLabelText('URL address')).toBeInvalid()
  })

  it('shows "already complete" when setup was finished meanwhile', async () => {
    server.use(
      http.post(mockPath('/setup'), () =>
        mockError(409, ERROR_CODES.SETUP_ALREADY_COMPLETED, 'done'),
      ),
    )
    const { user } = await openOrganizationStep()
    await user.type(screen.getByLabelText('Organization name'), 'Acme')
    await fillOwner(user)
    serveStatus(
      openStatus({ isComplete: true, finishedAt: '2026-01-02T09:00:00.000Z', checks: [] }),
    )
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    expect(await screen.findByRole('heading', { name: 'Setup is already complete' })).toBeVisible()
  })

  it('goes back to the server check', async () => {
    const { user } = await openOrganizationStep()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Welcome to SurefyOS' })).toBeVisible()
  })
})

describe('SetupWizard: AI model', () => {
  const resumeStatus = openStatus({ isComplete: true, checks: [] })

  it("opens Vault's add-key dialog, and lists what is connected", async () => {
    serveStatus(resumeStatus)
    const { user } = renderWizard({ resume: ACME })
    const list = await screen.findByRole('list', { name: 'Connected models' })
    expect(list).toHaveTextContent('OpenAI')
    await user.click(screen.getByRole('button', { name: 'Add API key' }))
    expect(await screen.findByRole('dialog', { name: 'Add API key' })).toBeVisible()
  })

  it('can be skipped, and the summary says no model is connected', async () => {
    useScenario('empty')
    serveStatus(resumeStatus)
    const { user } = renderWizard({ resume: ACME })
    expect(await screen.findByText(/Chat opens with a prompt to connect one/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(screen.getByRole('heading', { name: "You're ready" })).toBeVisible()
    expect(screen.getByText('Not connected yet')).toBeVisible()
  })
})

describe('SetupWizard: Ready', () => {
  async function openReadyStep() {
    serveStatus(openStatus({ isComplete: true, checks: [] }))
    const view = renderWizard({ resume: ACME })
    await view.user.click(await screen.findByRole('button', { name: 'Continue' }))
    return view
  }

  it('records the skipped model step and opens Chat', async () => {
    useScenario('empty')
    let body: unknown
    server.use(
      http.post(mockPath(`/orgs/${ORG_ID}/setup/complete`), async ({ request }) => {
        body = await request.json()
        return new Response(null, { status: 204 })
      }),
    )
    serveStatus(openStatus({ isComplete: true, checks: [] }))
    const { user } = renderWizard({ resume: ACME })
    await user.click(await screen.findByRole('button', { name: 'Skip for now' }))
    await user.click(screen.getByRole('button', { name: 'Open Chat' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/acme/chat')
    })
    expect(body).toEqual({ skippedSteps: ['model'] })
  })

  it('records no skipped step when a model is connected', async () => {
    let body: unknown
    server.use(
      http.post(mockPath(`/orgs/${ORG_ID}/setup/complete`), async ({ request }) => {
        body = await request.json()
        return new Response(null, { status: 204 })
      }),
    )
    const { user } = await openReadyStep()
    expect(screen.getByText(/models? connected/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Open Chat' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/acme/chat')
    })
    expect(body).toEqual({ skippedSteps: [] })
  })

  it('invites people with a role, one request each, and copies the link of an undelivered one', async () => {
    const sent: unknown[] = []
    server.use(
      http.post(mockPath(`/orgs/${ORG_ID}/invitations`), async ({ request }) => {
        const input = (await request.json()) as { email: string; role: string }
        sent.push(input)
        return mockOk(
          {
            id: '0191a000-0000-7000-8000-0000000000b1',
            email: input.email,
            role: input.role,
            status: 'pending',
            deliveryStatus: input.email.startsWith('bounce') ? 'bounced' : 'sent',
            teams: [],
            invitedBy: null,
            expiresAt: '2026-02-01T09:00:00.000Z',
            lastSentAt: null,
            sendCount: 1,
            acceptedAt: null,
            revokedAt: null,
            createdAt: '2026-01-02T09:00:00.000Z',
            updatedAt: '2026-01-02T09:00:00.000Z',
          },
          { status: 201 },
        )
      }),
    )
    const { user } = await openReadyStep()
    await user.type(screen.getByLabelText('Email addresses'), 'omar@acme.test, bounce@acme.test')
    await user.click(screen.getByRole('radio', { name: /Builder/ }))
    await user.click(screen.getByRole('button', { name: 'Send 2 invitations' }))
    const results = await screen.findByRole('list', { name: 'Invitation results' })
    expect(results).toHaveTextContent('omar@acme.test')
    expect(results).toHaveTextContent('Not delivered')
    expect(sent).toEqual([
      { email: 'omar@acme.test', role: 'builder', teamIds: [] },
      { email: 'bounce@acme.test', role: 'builder', teamIds: [] },
    ])
    expect(screen.getAllByRole('button', { name: 'Copy invite link' })).toHaveLength(1)
  })

  it('asks for at least one address', async () => {
    const { user } = await openReadyStep()
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Enter at least one email address.')).toBeVisible()
  })

  it('goes back to the AI model step from "Change"', async () => {
    const { user } = await openReadyStep()
    await user.click(screen.getByRole('button', { name: 'Change AI model' }))
    expect(screen.getByRole('heading', { name: 'Connect an AI model' })).toBeVisible()
  })
})

describe('SetupWizard: phones', () => {
  it('carries the phone notice next to the steps', async () => {
    serveStatus(openStatus())
    renderWizard()
    expect(await screen.findByText('Open on a computer to finish setup')).toBeInTheDocument()
  })
})
