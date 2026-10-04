// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_NAV } from '@/test/navFixtures'

import { useShellOverlayStore } from '../Workspace.store'
import { useShellShortcuts } from './WorkspaceShell.shortcuts'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const navItems = TEST_NAV.map((entry) => ({ entry, isLocked: false }))

function setup() {
  const onToggleSidebar = vi.fn()
  renderHook(() => {
    useShellShortcuts({ orgSlug: 'acme', navItems, onToggleSidebar })
  })
  return { onToggleSidebar }
}

const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
  fireEvent.keyDown(target, { key, ...init })

beforeEach(() => {
  push.mockReset()
  useShellOverlayStore.setState({ open: null })
})

describe('useShellShortcuts', () => {
  it('opens the command palette with ⌘K or Ctrl K, even while typing', () => {
    setup()
    const input = document.createElement('input')
    document.body.append(input)
    press('k', { ctrlKey: true }, input)
    expect(useShellOverlayStore.getState().open).toBe('commands')
    input.remove()
  })

  it('toggles the sidebar with [ and opens the help with ?', () => {
    const { onToggleSidebar } = setup()
    press('[')
    expect(onToggleSidebar).toHaveBeenCalledOnce()
    press('?')
    expect(useShellOverlayStore.getState().open).toBe('shortcuts')
  })

  it('goes to a module with g then its key', () => {
    setup()
    press('g')
    press('a')
    expect(push).toHaveBeenCalledWith('/acme/agents')
  })

  it('ignores single keys while typing or with an overlay open', () => {
    const { onToggleSidebar } = setup()
    const input = document.createElement('input')
    document.body.append(input)
    press('[', {}, input)
    useShellOverlayStore.setState({ open: 'commands' })
    press('[')
    expect(onToggleSidebar).not.toHaveBeenCalled()
    input.remove()
  })
})
