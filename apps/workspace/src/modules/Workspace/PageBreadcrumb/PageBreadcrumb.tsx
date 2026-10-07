// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useEffect } from 'react'

import { useShellCrumbStore } from '../Workspace.store'

import type { ShellCrumb } from '../Workspace.types'

/**
 * Adds the object levels to the top-bar breadcrumb ("Agents / Support triage / Tools") while the
 * page is on screen; the shell already shows the organization and the module. Renders nothing.
 */
export default function PageBreadcrumb({ items }: Readonly<{ items: ShellCrumb[] }>) {
  const setCrumbs = useShellCrumbStore((state) => state.setCrumbs)
  const reset = useShellCrumbStore((state) => state.reset)

  useEffect(() => {
    setCrumbs(items)
    return reset
  }, [items, setCrumbs, reset])

  return null
}
