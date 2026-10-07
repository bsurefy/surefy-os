// SPDX-License-Identifier: AGPL-3.0-only
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SkeletonForm, SkeletonRows, SkeletonStat } from './Skeletons'

describe('Skeletons', () => {
  it('draws the asked number of rows, with a leading circle and two bars', () => {
    const { container } = render(<SkeletonRows rows={4} hasLeading lines={2} />)
    const rows = container.firstElementChild
    expect(rows).toHaveAttribute('aria-hidden', 'true')
    expect(rows?.childElementCount).toBe(4)
    expect(rows?.firstElementChild?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
  })

  it('draws one label and one field bar per form field', () => {
    const { container } = render(<SkeletonForm fields={2} columns={2} />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4)
    expect(container.firstElementChild).toHaveClass('md:grid-cols-2')
  })

  it('sizes the stat placeholder like the stat card', () => {
    const { container } = render(<SkeletonStat size="sm" />)
    expect(container.firstElementChild).toHaveClass('px-4', 'py-3.5')
  })
})
