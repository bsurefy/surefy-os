// SPDX-License-Identifier: AGPL-3.0-only
import type { ElementType } from 'react'

export interface TabItem {
  value: string
  /** Translated text. */
  label: string
  /** Count badge after the label. */
  count?: number
  /** Route tabs (`/agents/[agentId]/[tab]`): each tab is a link. */
  href?: string
}

export interface TabsProps {
  items: TabItem[]
  /** The selected tab. */
  value: string
  /** In-page tabs: called with the new value. Route tabs navigate through `href` instead. */
  onValueChange?: (value: string) => void
  /** Accessible name of the tab list. Translated text. */
  label: string
  /** Link component for route tabs (for example Next.js `Link`); defaults to `<a>`. */
  linkComponent?: ElementType
  className?: string
}
