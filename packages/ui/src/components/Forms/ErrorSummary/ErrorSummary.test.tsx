// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import ErrorSummary from './ErrorSummary'

describe('ErrorSummary', () => {
  it('takes focus and links each problem to its field', async () => {
    render(
      <>
        <input id="team-name" aria-label="Team name" />
        <ErrorSummary
          title="Fix 2 problems to continue"
          formErrors={['A team named Support already exists']}
          errors={[{ fieldId: 'team-name', message: 'Enter a team name' }]}
        />
      </>,
    )
    expect(screen.getByRole('region', { name: 'Fix 2 problems to continue' })).toHaveFocus()
    expect(screen.getByText('A team named Support already exists')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Enter a team name' }))
    expect(screen.getByRole('textbox', { name: 'Team name' })).toHaveFocus()
  })

  it('renders nothing without errors', () => {
    const { container } = render(<ErrorSummary title="Problems" errors={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
