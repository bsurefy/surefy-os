// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import ConfirmDialog from './ConfirmDialog'

import type { ConfirmDialogProps } from './ConfirmDialog.types'

const labels = {
  confirm: 'Delete knowledge base',
  reason: 'Reason',
  reasonRequired: 'Enter a reason',
  typeToConfirm: (name: string) => `Type ${name} to confirm`,
  typeMismatch: (name: string) => `The name does not match. Type ${name}`,
}

function Harness(props: Readonly<Partial<ConfirmDialogProps>>) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <output>{open ? 'open' : 'closed'}</output>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tier="T2"
        title="Revoke the OpenAI key?"
        description="Agents using it stop working until a new key is added."
        impact={['3 agents use this key and will stop working']}
        labels={{ confirm: 'Revoke key' }}
        onConfirm={vi.fn()}
        {...props}
      />
    </>
  )
}

describe('ConfirmDialog', () => {
  it('T2 focuses Cancel, lists the impact and repeats the verb', async () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke the OpenAI key?' })
    expect(dialog).toHaveTextContent('3 agents use this key and will stop working')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Revoke key' }))
    expect(onConfirm).toHaveBeenCalledWith({ reason: undefined })
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('closed')
  })

  it('stays open with what was typed when the action fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('offline'))
    render(<Harness onConfirm={onConfirm} error="Couldn't revoke the key. Try again." />)
    await userEvent.click(screen.getByRole('button', { name: 'Revoke key' }))
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('open')
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't revoke the key")
  })

  it('T3 needs a reason and the typed name, and Esc keeps what was typed', async () => {
    const onConfirm = vi.fn()
    render(
      <Harness
        tier="T3"
        title="Delete Product docs?"
        labels={labels}
        confirmationText="Product docs"
        onConfirm={onConfirm}
      />,
    )
    const reason = screen.getByRole('textbox', { name: 'Reason' })
    await waitFor(() => {
      expect(reason).toHaveFocus()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Delete knowledge base' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(reason).toHaveAccessibleDescription('Enter a reason')
    await userEvent.type(reason, 'Replaced by the 2027 handbook')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('open')
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Type Product docs to confirm' }),
      'Product docs',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Delete knowledge base' }))
    expect(onConfirm).toHaveBeenCalledWith({ reason: 'Replaced by the 2027 handbook' })
  })
})
