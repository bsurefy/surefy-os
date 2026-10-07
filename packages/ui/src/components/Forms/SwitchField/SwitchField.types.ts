// SPDX-License-Identifier: AGPL-3.0-only
import type { Switch } from '../../../primitives/switch'
import type { ComponentProps, ReactNode } from 'react'

export interface SwitchFieldProps extends Omit<ComponentProps<typeof Switch>, 'children'> {
  /** Translated label; clicking it toggles the switch. */
  label: ReactNode
  /** What turning it on does. */
  description?: ReactNode
  /** `md` for settings (default), `sm` for tables and dense lists. */
  size?: 'sm' | 'md'
}
