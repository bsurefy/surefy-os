// SPDX-License-Identifier: AGPL-3.0-only
import { Lock } from 'lucide-react'

import { cn } from '../../../lib/utils'

import type { EditionBadgeProps } from './EditionBadge.types'

/** "Enterprise" or "Cloud" outline badge with a lock, on gated items. Never abbreviated. */
export default function EditionBadge({ label, className }: Readonly<EditionBadgeProps>) {
  return (
    <span
      className={cn(
        'border-border text-foreground-secondary text-caption inline-flex h-[1.375rem] w-fit items-center gap-1 rounded-full border px-2 font-medium whitespace-nowrap',
        className,
      )}
    >
      <Lock aria-hidden className="size-3" />
      {label}
    </span>
  )
}
