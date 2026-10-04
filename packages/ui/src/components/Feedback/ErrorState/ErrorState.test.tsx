// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { UiLabelsProvider } from '../../../lib/labels'
import Banner from '../Banner'
import ProgressBar from '../ProgressBar'
import SessionBanner from '../SessionBanner'
import Spinner from '../Spinner'
import ErrorState from './ErrorState'

describe('ErrorState', () => {
  it('offers retry and a copyable request ID', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <ErrorState
        title="Couldn't load runs"
        message="The rest of SurefyOS is working; only this page failed."
        details="Error 503 · 10:42 UTC"
        reference="req_7c1e94"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('heading', { name: "Couldn't load runs" })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await navigator.clipboard.readText()).toBe('Error 503 · 10:42 UTC · req_7c1e94')
  })

  it('reads built-in labels from the provider', () => {
    render(
      <UiLabelsProvider labels={{ retry: 'Erneut versuchen', loading: 'Wird geladen' }}>
        <ErrorState message="Fehler" onRetry={vi.fn()} />
        <Spinner />
      </UiLabelsProvider>,
    )
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Wird geladen')
  })
})

describe('Banner', () => {
  it('can be dismissed only when it offers it, and announces when asked', async () => {
    const onDismiss = vi.fn()
    const { rerender } = render(
      <Banner
        tone="warning"
        title="You're offline"
        description="Changes are paused."
        isAnnounced
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline")
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    rerender(<Banner tone="success" title="Import finished" onDismiss={onDismiss} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('keeps session banners without a dismiss button', () => {
    render(
      <SessionBanner
        kind="access"
        message="Support (Lena K.) is viewing this organization until 14:30"
        action={<button type="button">End session</button>}
      />,
    )
    const region = screen.getByRole('region', { name: /Support \(Lena K\.\)/ })
    expect(region).toHaveClass('bg-foreground', 'text-background')
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('names the work and reads out the progress', () => {
    render(<ProgressBar label="Indexing Product docs" value={42} valueText="84 of 200 files" />)
    expect(screen.getByRole('progressbar', { name: 'Indexing Product docs' })).toHaveAttribute(
      'aria-valuetext',
      '84 of 200 files',
    )
  })
})
