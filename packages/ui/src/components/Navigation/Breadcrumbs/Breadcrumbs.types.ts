// SPDX-License-Identifier: AGPL-3.0-only
import type { ElementType } from 'react'

export interface BreadcrumbItem {
  /** Translated text. */
  label: string
  /** Every item but the last links somewhere; the last item is the current object. */
  href?: string
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  /** Accessible name of the breadcrumb landmark. Translated text. */
  label: string
  /** Link component to render (for example Next.js `Link`); defaults to `<a>`. */
  linkComponent?: ElementType
  className?: string
}
