// SPDX-License-Identifier: AGPL-3.0-only
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef } from 'react'

import { GO_SEQUENCE_TIMEOUT_MS } from '../Workspace.constants'
import { useShellOverlayStore } from '../Workspace.store'
import { isTypingTarget, toRoute } from '../Workspace.utils'

import type { VisibleNavEntry } from '../Workspace.types'

interface ShellShortcutsOptions {
  orgSlug: string
  navItems: readonly VisibleNavEntry[]
  onToggleSidebar: () => void
}

/**
 * The workspace's keyboard shortcuts (navigation.md §7): ⌘K / Ctrl K anywhere; `[`, `g` then a
 * module key, and `?` only when the person is not typing and no shell overlay is open. `n` and
 * Esc belong to the pages and the overlays.
 */
export function useShellShortcuts({ orgSlug, navItems, onToggleSidebar }: ShellShortcutsOptions) {
  const router = useRouter()
  const goStartedAt = useRef<number | null>(null)

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const { open, setOpen } = useShellOverlayStore.getState()
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      setOpen('commands', open !== 'commands')
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
    if (open !== null || isTypingTarget(event.target)) return

    const startedAt = goStartedAt.current
    goStartedAt.current = null
    if (startedAt !== null && event.timeStamp - startedAt <= GO_SEQUENCE_TIMEOUT_MS) {
      const match = navItems.find((item) => item.entry.goKey === event.key)
      if (match) {
        event.preventDefault()
        router.push(toRoute(match.entry.href(orgSlug)))
      }
      return
    }
    if (event.key === 'g') goStartedAt.current = event.timeStamp
    else if (event.key === '[') onToggleSidebar()
    else if (event.key === '?') setOpen('shortcuts', true)
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      onKeyDown(event)
    }
    globalThis.addEventListener('keydown', listener)
    return () => {
      globalThis.removeEventListener('keydown', listener)
    }
  }, [])
}
