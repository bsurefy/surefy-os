// SPDX-License-Identifier: AGPL-3.0-only
import type { LucideIcon } from 'lucide-react'

export interface IconTileProps {
  icon: LucideIcon
  /** `sm` 30px (suggestion cards), `md` 36px (list rows), `lg` 44px (empty states). */
  size?: 'sm' | 'md' | 'lg'
  /** Soft fill: `primary` by default; status tones for warnings and failures. */
  tone?: 'primary' | 'neutral' | 'success' | 'warning' | 'destructive'
  className?: string
}
