// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Plus } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('uses the catalog defaults: primary, md (36px)', () => {
    render(<Button>Create organization</Button>)
    const button = screen.getByRole('button', { name: 'Create organization' })
    expect(button).toHaveAttribute('data-variant', 'primary')
    expect(button).toHaveAttribute('data-size', 'md')
    expect(button.className).toContain('h-9')
  })

  it('renders the leading icon and swaps it for a spinner while loading', () => {
    const { rerender } = render(<Button icon={Plus}>Add key</Button>)
    expect(screen.getByRole('button').querySelector('svg')).toHaveClass('lucide-plus')
    rerender(
      <Button icon={Plus} isLoading>
        Add key
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Add key' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
    expect(button.querySelector('svg')).not.toHaveClass('lucide-plus')
  })

  it('accepts an icon element, as server components pass it', () => {
    render(<Button icon={<Plus />}>Add key</Button>)
    const icon = screen.getByRole('button').querySelector('svg')
    expect(icon).toHaveClass('lucide-plus')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('stays focusable but ignores clicks when aria-disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button aria-disabled="true" onClick={onClick}>
        Publish
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Publish' })
    await userEvent.tab()
    expect(button).toHaveFocus()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('calls onClick when enabled', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('puts the consumer className last', () => {
    render(<Button className="w-full">Wide</Button>)
    expect(screen.getByRole('button').className.endsWith('w-full')).toBe(true)
  })
})
