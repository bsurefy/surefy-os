// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps, ReactNode } from 'react'

export interface AppShellProps extends ComponentProps<'div'> {
  /** The sidebar (Navigation/Sidebar). Hidden below 768px, where the top bar opens it as a sheet. */
  sidebar: ReactNode
  /** The 56px top bar: breadcrumb, search, actions, notifications, user menu. */
  topBar: ReactNode
  /** Session banners above the whole frame; they push it down instead of covering it. */
  banner?: ReactNode
  /** `reading`: 880–1120px content width; `full`: full width (tables, canvases). */
  width?: 'reading' | 'full'
}
