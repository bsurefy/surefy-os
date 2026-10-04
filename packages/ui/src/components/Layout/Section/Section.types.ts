// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps, ReactNode } from 'react'

export interface SectionProps extends Omit<ComponentProps<'section'>, 'title'> {
  /** Section title (15/22). Translated text. */
  title?: ReactNode
  description?: ReactNode
  /** Actions on the right of the title row. */
  actions?: ReactNode
  /** Removes the card frame (border, surface, padding) for sections inside another card. */
  isPlain?: boolean
}
