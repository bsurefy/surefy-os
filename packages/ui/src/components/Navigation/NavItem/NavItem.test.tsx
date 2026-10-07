// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { MessageSquare } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import NavItem from './NavItem'
import { TooltipProvider } from '../../../primitives/tooltip'

describe('NavItem', () => {
  it('marks the active item and shows its count', () => {
    render(
      <ul>
        <NavItem href="/chat" label="Chat" icon={MessageSquare} count={3} isActive />
      </ul>,
    )
    const link = screen.getByRole('link', { name: /Chat/ })
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link).toHaveTextContent('3')
  })

  it('keeps the label as the accessible name when collapsed', () => {
    render(
      <TooltipProvider>
        <ul>
          <NavItem href="/chat" label="Chat" icon={MessageSquare} count={3} isCollapsed />
        </ul>
      </TooltipProvider>,
    )
    const link = screen.getByRole('link', { name: 'Chat' })
    expect(link).not.toHaveTextContent('3')
  })
})
