// SPDX-License-Identifier: AGPL-3.0-only
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ElementType, ReactNode } from 'react'

export interface NavItemProps extends Omit<ComponentProps<'a'>, 'children'> {
  /** Item label. Translated text. */
  label: string
  /** 20px navigation icon. */
  icon?: LucideIcon
  /** Count badge (unread, pending). */
  count?: number
  isActive?: boolean
  /** Collapsed sidebar: show only the icon and put the label in a tooltip. */
  isCollapsed?: boolean
  /** Locked or extra marker after the label (for example an edition badge). */
  trailing?: ReactNode
  /** Link component to render (for example Next.js `Link`); defaults to `<a>`. */
  linkComponent?: ElementType
}
