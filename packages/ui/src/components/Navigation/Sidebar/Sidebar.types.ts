// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps, ReactNode } from 'react'

export interface SidebarProps extends ComponentProps<'nav'> {
  /** 64px icon rail instead of 248px; item labels move into tooltips. */
  isCollapsed?: boolean
  /** The 60px brand row at the very top (product mark and wordmark), with a line under it. */
  brand?: ReactNode
  /** Below the brand row: the organization switcher. */
  header?: ReactNode
  /** Bottom of the sidebar: context, collapse and the person. */
  footer?: ReactNode
  /** Accessible name of the navigation landmark. Translated text. */
  label: string
}

export interface SidebarGroupProps extends ComponentProps<'div'> {
  /** Overline label of the group (hidden when the sidebar is collapsed). */
  label?: ReactNode
  isCollapsed?: boolean
}
