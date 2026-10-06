// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'

function renderDialog() {
  return render(
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>They get an email.</DialogDescription>
        </DialogHeader>
        <DialogBody>Fields</DialogBody>
        <DialogFooter>Actions</DialogFooter>
      </DialogContent>
    </Dialog>,
  )
}

describe('Dialog', () => {
  it('lets the body shrink and scroll when it sits inside a form with the footer', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add API key</DialogTitle>
            <DialogDescription>Connect a provider.</DialogDescription>
          </DialogHeader>
          <form aria-label="Add API key form">
            <DialogBody>Fields</DialogBody>
            <DialogFooter>Actions</DialogFooter>
          </form>
        </DialogContent>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Add API key' })
    expect(dialog.className).toContain('[&>form]:min-h-0')
    expect(dialog.className).toContain('[&>form]:flex-col')
  })

  it('sets the header and the footer off with lines and scrolls only the body', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Invite people' })
    expect(dialog.querySelector('[data-slot="dialog-header"]')).toHaveClass('border-b')
    expect(dialog.querySelector('[data-slot="dialog-footer"]')).toHaveClass('border-t')
    expect(dialog.querySelector('[data-slot="dialog-body"]')).toHaveClass('overflow-y-auto')
    // the close button sits partly outside the card, so the card must not clip it
    expect(dialog).not.toHaveClass('overflow-hidden')
  })

  it('gives the close button the card background and a label', () => {
    renderDialog()
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toHaveClass('bg-surface', 'rounded-full')
  })
})
