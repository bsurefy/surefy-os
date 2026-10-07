// SPDX-License-Identifier: AGPL-3.0-only
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { toast } from './toast'
import Toaster from './Toaster'

afterEach(() => {
  act(() => {
    toast.dismiss()
  })
})

describe('toast', () => {
  it('shows a message in the notifications region', async () => {
    render(<Toaster />)
    act(() => {
      toast.success('Invite sent to sofia@acme.com')
    })
    expect(await screen.findByText('Invite sent to sofia@acme.com')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Notifications/ })).toBeInTheDocument()
  })

  it('undoes a T1 action without committing it', async () => {
    const onUndo = vi.fn()
    const onCommit = vi.fn()
    render(<Toaster />)
    act(() => {
      toast.undo('Moved to Archive', { undoLabel: 'Undo', onUndo, onCommit })
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onCommit).not.toHaveBeenCalled()
  })
})
