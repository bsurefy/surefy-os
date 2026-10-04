// SPDX-License-Identifier: AGPL-3.0-only
import { MutationObserver, useQueryClient } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useQueryState } from 'nuqs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ERROR_CODES } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useUiLabels } from '@surefy/ui/lib/labels'

import { CoreProviders } from './CoreProviders'
import { getErrorMessage } from '../errors/getErrorMessage'
import { ApiError } from '../http/ApiError'
import { loadSharedMessages } from '../i18n/loadSharedMessages'
import { getQueryClient } from '../query/getQueryClient'

import type { CoreErrorHandlers } from './CoreProviders.types'
import type { ErrorsTranslator } from '../errors/errors.types'
import type { ReactNode } from 'react'

// The nuqs adapter for the App Router reads Next.js navigation hooks, which need a running app.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams('q=agents'),
}))

const messages = await loadSharedMessages('en')

function createHandlers(): CoreErrorHandlers {
  return { onUnauthenticated: vi.fn(), onFeatureUnavailable: vi.fn() }
}

function renderWithCore(children: ReactNode, handlers = createHandlers()) {
  return render(
    <CoreProviders locale="en" messages={messages} handlers={handlers}>
      {children}
    </CoreProviders>,
  )
}

function Probe() {
  const t = useTranslations('common')
  // A real next-intl translator of the flat `errors` namespace satisfies the error helpers' type.
  const tErrors: ErrorsTranslator = useTranslations('errors')
  const labels = useUiLabels()
  const client = useQueryClient()
  const { themes } = useTheme()
  const [q] = useQueryState('q')
  return (
    <dl>
      <dd data-testid="intl">{t('close')}</dd>
      <dd data-testid="labels">{labels.retry}</dd>
      <dd data-testid="query">{client === getQueryClient() ? 'singleton' : 'other'}</dd>
      <dd data-testid="theme">{themes.join(',')}</dd>
      <dd data-testid="nuqs">{q}</dd>
      <dd data-testid="error">
        {getErrorMessage(new ApiError(404, ERROR_CODES.NOT_FOUND, 'Not found'), tErrors)}
      </dd>
    </dl>
  )
}

async function failMutation(error: Error) {
  const observer = new MutationObserver(getQueryClient(), {
    mutationFn: () => Promise.reject(error),
  })
  await act(async () => {
    await observer.mutate().catch(() => {
      // the rejection is expected; the toast is what is tested
    })
  })
}

afterEach(() => {
  act(() => {
    toast.dismiss()
  })
})

describe('CoreProviders', () => {
  it('mounts intl, the ui labels, the query client, the theme and the nuqs adapter', () => {
    renderWithCore(<Probe />)

    expect(screen.getByTestId('intl')).toHaveTextContent('Close')
    expect(screen.getByTestId('labels')).toHaveTextContent('Try again')
    expect(screen.getByTestId('query')).toHaveTextContent('singleton')
    expect(screen.getByTestId('theme')).toHaveTextContent('light,dark,system')
    expect(screen.getByTestId('nuqs')).toHaveTextContent('agents')
    expect(screen.getByTestId('error')).toHaveTextContent('This item no longer exists')
  })

  it('installs the translated Zod error map', () => {
    renderWithCore('child')

    expect(z.string().min(3).safeParse('ab').error?.issues[0]?.message).toBe(
      'Must be at least 3 characters.',
    )
  })

  it('shows failed mutations as a translated toast with a copy action for the request id', async () => {
    renderWithCore('child')

    await failMutation(new ApiError(409, ERROR_CODES.TEAM_NAME_TAKEN, 'Taken', [], 'req_42'))

    expect(await screen.findByText(/A team with this name already exists/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy details' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Notifications/ })).toBeInTheDocument()
  })

  it('routes session and feature errors to the app handlers', async () => {
    const handlers = createHandlers()
    renderWithCore('child', handlers)

    await failMutation(new ApiError(401, ERROR_CODES.AUTH_UNAUTHENTICATED, 'No session'))
    await failMutation(new ApiError(403, ERROR_CODES.FEATURE_NOT_AVAILABLE, 'Enterprise only'))

    expect(handlers.onUnauthenticated).toHaveBeenCalledOnce()
    expect(handlers.onFeatureUnavailable).toHaveBeenCalledOnce()
    expect(screen.queryByText(/session has ended/)).not.toBeInTheDocument()
    expect(await screen.findByText(/isn't included in your edition/)).toBeInTheDocument()
  })
})
