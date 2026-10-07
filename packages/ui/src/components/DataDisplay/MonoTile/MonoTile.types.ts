// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps } from 'react'

export interface MonoTileProps extends ComponentProps<'span'> {
  /** `sm` 26px (model selectors), `md` 28px (switchers), `lg` 36px (list rows). */
  size?: 'sm' | 'md' | 'lg'
  /** Initials or a short code, at most three characters. */
  children: string
}
