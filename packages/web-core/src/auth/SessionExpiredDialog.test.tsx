// SPDX-License-Identifier: AGPL-3.0-only
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../testing'
import { SessionExpiredDialog } from './SessionExpiredDialog'
import { closeSessionExpired, openSessionExpired } from './sessionExpiredStore'

import type { SessionSignInSlotProps } from './SessionExpiredDialog.types'

function SignInForm({ onSignedIn }: Readonly<SessionSignInSlotProps>) {
  return (
    <button type="button" onClick={onSignedIn}>
      Sign in
    </button>
  )
}

function renderDialog(onSignOut = vi.fn()) {
  const result = renderWithProviders(
    <>
      <textarea aria-label="Draft" defaultValue="Unsaved draft" />
      <SessionExpiredDialog
        renderSignIn={(props) => <SignInForm {...props} />}
        onSignOut={onSignOut}
      />
    </>,
  )
  return { ...result, onSignOut }
}

afterEach(() => {
  act(() => {
    closeSessionExpired()
  })
})

describe('SessionExpiredDialog', () => {
  it('stays closed until the session expires, then opens over the page', () => {
    renderDialog()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    act(() => {
      openSessionExpired()
    })

    expect(
      screen.getByRole('alertdialog', { name: "You've been signed out" }),
    ).toHaveAccessibleDescription(
      "You've been signed out for security. Sign in again to continue. Your unsaved changes are kept.",
    )
  })

  it('cannot be dismissed with Esc', async () => {
    const { user } = renderDialog()
    act(() => {
      openSessionExpired()
    })

    await user.keyboard('{Escape}')

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('closes after signing in, keeps the page and refetches the queries', async () => {
    const { user, queryClient } = renderDialog()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    act(() => {
      openSessionExpired()
    })

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(invalidate).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'Draft', hidden: true })).toHaveValue(
      'Unsaved draft',
    )
  })

  it('signs out through the app', async () => {
    const { user, onSignOut } = renderDialog()
    act(() => {
      openSessionExpired()
    })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(onSignOut).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })
})
