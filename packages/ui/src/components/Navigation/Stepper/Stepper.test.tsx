// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Stepper from './Stepper'

describe('Stepper', () => {
  it('numbers the steps and marks the current one', () => {
    render(
      <Stepper
        label="Setup steps"
        steps={['Welcome', 'Organization', 'AI model', 'Ready']}
        current={2}
        stateLabels={{ done: 'done', current: 'current step' }}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[2]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).toHaveTextContent('Welcome (done)')
    expect(items[3]).toHaveTextContent('4')
  })
})
