// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import PaginationFooter from './PaginationFooter'

const labels = {
  range: '1–50 of 4,812',
  previous: 'Previous page',
  next: 'Next page',
  pageSize: 'Rows',
}

describe('PaginationFooter', () => {
  it('shows the range and disables previous on the first page', async () => {
    const onNext = vi.fn()
    render(
      <PaginationFooter
        labels={labels}
        hasPrevious={false}
        hasNext
        onPrevious={vi.fn()}
        onNext={onNext}
      />,
    )
    expect(screen.getByText('1–50 of 4,812')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onNext).toHaveBeenCalledOnce()
  })
})
