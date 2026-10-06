// SPDX-License-Identifier: AGPL-3.0-only
import type { LucideIcon } from 'lucide-react'

export interface SettingsNavItemProps {
  orgSlug: string
  icon: LucideIcon
  isCollapsed?: boolean
  /** Called after a section is chosen (the mobile menu closes). */
  onNavigate?: () => void
}

/** One settings section the person may open. */
export interface SettingsNavSection {
  id: string
  href: string
  label: string
  /** A few words after the label ("Keys & models"). */
  hint?: string
  isActive: boolean
}
