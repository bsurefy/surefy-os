// SPDX-License-Identifier: AGPL-3.0-only
import type { ElementType, ReactNode } from 'react'

export interface SidePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Object title. */
  title: string
  description?: ReactNode
  /** sm 400, md 480 (default), lg 640; full screen below 768px. */
  size?: 'sm' | 'md' | 'lg'
  /** Scrolling body. */
  children: ReactNode
  /** Sticky footer actions. */
  footer?: ReactNode
  /** Row detail: move to the previous or next row of the list without closing. */
  onPrevious?: () => void
  onNext?: () => void
  /** Row detail: "Open full page" for complex objects. */
  fullPageHref?: string
  linkComponent?: ElementType
}
