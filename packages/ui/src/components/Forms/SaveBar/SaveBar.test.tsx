// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import SaveBar from './SaveBar'

const labels = { message: '3 unsaved changes', discard: 'Discard', save: 'Save' }

describe('SaveBar', () => {
  it('appears only with unsaved changes', () => {
    const { rerender } = render(<SaveBar labels={labels} isDirty={false} onDiscard={vi.fn()} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    rerender(<SaveBar labels={labels} isDirty onDiscard={vi.fn()} />)
    expect(screen.getByRole('region', { name: '3 unsaved changes' })).toBeInTheDocument()
  })

  it('submits the linked form and ignores clicks while saving', async () => {
    const onSubmit = vi.fn()
    const { rerender } = render(
      <>
        <form
          id="settings"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        />
        <SaveBar labels={labels} isDirty formId="settings" onDiscard={vi.fn()} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    rerender(
      <>
        <form
          id="settings"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        />
        <SaveBar labels={labels} isDirty isSaving formId="settings" onDiscard={vi.fn()} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled()
  })
})
