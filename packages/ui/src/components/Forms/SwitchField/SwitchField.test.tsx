// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import SegmentedControl from '../SegmentedControl'
import SwitchField from './SwitchField'

describe('SwitchField', () => {
  it('toggles from its label and describes what it does', async () => {
    const onCheckedChange = vi.fn()
    render(
      <SwitchField
        label="Require two-factor authentication"
        description="Members set it up at their next sign-in."
        onCheckedChange={onCheckedChange}
      />,
    )
    const toggle = screen.getByRole('switch', { name: 'Require two-factor authentication' })
    expect(toggle).toHaveAccessibleDescription('Members set it up at their next sign-in.')
    expect(toggle).toHaveAttribute('data-size', 'md')
    await userEvent.click(screen.getByText('Require two-factor authentication'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})

describe('SegmentedControl', () => {
  it('is a radio group that moves with the arrow keys', async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedControl
        label="Period"
        value="7d"
        onValueChange={onValueChange}
        options={[
          { value: '7d', label: '7 days' },
          { value: '30d', label: '30 days' },
          { value: '90d', label: '90 days' },
        ]}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: 'Period' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '7 days' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: '7 days' }))
    // Radix moves focus, and with it the choice, in a timeout while the key is down.
    await userEvent.keyboard('{ArrowRight>}')
    await waitFor(() => {
      expect(onValueChange).toHaveBeenCalledWith('30d')
    })
    await userEvent.keyboard('{/ArrowRight}')
  })
})
