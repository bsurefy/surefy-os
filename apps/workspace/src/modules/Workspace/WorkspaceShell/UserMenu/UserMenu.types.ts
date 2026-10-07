// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface UserMenuProps {
  orgSlug: string
  /** The element that opens the menu (the sidebar's user button); defaults to the avatar. */
  trigger?: ReactNode
  side?: 'top' | 'bottom'
  align?: 'start' | 'end'
}
