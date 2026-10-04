// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps, ReactNode } from 'react'

export interface PageHeaderProps extends Omit<ComponentProps<'header'>, 'title'> {
  /** The one title of the page. Translated text. */
  title: ReactNode
  /** One-line description under the title. */
  description?: ReactNode
  /**
   * `page`: module or area page (24/32). `object`: detail page of one object (18/26), with
   * breadcrumb, status and key facts.
   */
  level?: 'page' | 'object'
  /** Breadcrumb above the title (object pages). */
  breadcrumb?: ReactNode
  /** Status pill next to the object title. */
  status?: ReactNode
  /** Key facts row under the title (object pages). */
  facts?: ReactNode
  /** Primary action first; other actions in a "⋯" menu. */
  actions?: ReactNode
  /** Tabs under the header. */
  tabs?: ReactNode
}
