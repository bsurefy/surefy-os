// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import SecretInput from './SecretInput'

describe('SecretInput', () => {
  it('shows the secret only while the field has focus', async () => {
    render(
      <>
        <SecretInput aria-label="API key" labels={{ show: 'Show', hide: 'Hide' }} />
        <button type="button">Elsewhere</button>
      </>,
    )
    const input = screen.getByLabelText('API key')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(input)
    expect(input).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(input).toHaveAttribute('type', 'password')
  })
})
