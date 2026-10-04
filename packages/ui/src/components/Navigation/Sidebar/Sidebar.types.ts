// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps, ReactNode } from 'react'

export interface SidebarProps extends ComponentProps<'nav'> {
  /** 64px icon rail instead of 248px; item labels move into tooltips. */
  isCollapsed?: boolean
  /** Top of the sidebar: product mark, organization switcher. */
  header?: ReactNode
  /** Bottom of the sidebar: context and user. */
  footer?: ReactNode
  /** Accessible name of the navigation landmark. Translated text. */
  label: string
}

export interface SidebarGroupProps extends ComponentProps<'div'> {
  /** Overline label of the group (hidden when the sidebar is collapsed). */
  label?: ReactNode
  isCollapsed?: boolean
}
