// SPDX-License-Identifier: AGPL-3.0-only
import { notFound } from 'next/navigation'

import { WORKSPACE_NAV } from './Workspace.constants'

import type { NavItemKey } from './Workspace.types'

/** Whether a module is released in this version (its navigation entry's `released` flag). */
export function isNavReleased(key: NavItemKey): boolean {
  return WORKSPACE_NAV.some((entry) => entry.key === key && entry.released)
}

/**
 * For the pages of a module that is not released yet: answers the not-found page, so the module
 * cannot be reached by URL (pages-routing.md §8). Call it first in every page of the module.
 */
export function assertNavReleased(key: NavItemKey): void {
  if (!isNavReleased(key)) notFound()
}
