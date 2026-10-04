// SPDX-License-Identifier: AGPL-3.0-only
import { statusDotVariants, statusPillVariants } from './StatusPill.variants'
import { cn } from '../../../lib/utils'

import type { StatusPillProps } from './StatusPill.types'

/** 24px pill: a 7px dot and the status word on the soft background of its family. */
export default function StatusPill({
  label,
  tone,
  isPulsing = false,
  className,
}: Readonly<StatusPillProps>) {
  return (
    <span className={cn(statusPillVariants({ tone }), className)}>
      <span
        aria-hidden
        className={cn(
          statusDotVariants({ tone }),
          isPulsing && 'motion-safe:animate-pulse motion-safe:[animation-duration:1.6s]',
        )}
      />
      {label}
    </span>
  )
}
