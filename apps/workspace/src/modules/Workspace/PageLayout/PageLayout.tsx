// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useEffect } from 'react'

import { useShellLayoutStore } from '../Workspace.store'

import type { ShellWidth } from '../Workspace.store'

/**
 * Sets how the shell lays the page out while it is on screen: `reading` (880–1120px, the default),
 * `full` (tables, canvases) or `flush` (no gutters, the page fills the frame: Chat). Renders nothing.
 */
export default function PageLayout({ width }: Readonly<{ width: ShellWidth }>) {
  const setWidth = useShellLayoutStore((state) => state.setWidth)
  const reset = useShellLayoutStore((state) => state.reset)

  useEffect(() => {
    setWidth(width)
    return reset
  }, [width, setWidth, reset])

  return null
}
