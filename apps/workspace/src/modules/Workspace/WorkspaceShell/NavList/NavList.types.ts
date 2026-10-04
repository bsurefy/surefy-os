// SPDX-License-Identifier: AGPL-3.0-only
export interface NavListProps {
  orgSlug: string
  isCollapsed?: boolean
  /** Called after an item is chosen (the mobile menu closes). */
  onNavigate?: () => void
}
