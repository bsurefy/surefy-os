// SPDX-License-Identifier: AGPL-3.0-only
export interface SidebarFooterProps {
  orgSlug: string
  isCollapsed?: boolean
  /** Omitted in the mobile menu, which has no collapsed state. */
  onToggleCollapsed?: () => void
}
