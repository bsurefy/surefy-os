// SPDX-License-Identifier: AGPL-3.0-only
import { CircleAlert } from 'lucide-react'

import { cn } from '../../../lib/utils'

import type { MeterProps } from './Meter.types'

/** Used / limit bar with "x of y" text; warning at the alert threshold, destructive at the limit. */
export default function Meter({
  label,
  value,
  max,
  valueText,
  warningAt = 0.8,
  className,
}: Readonly<MeterProps>) {
  const share = max > 0 ? value / max : 0
  let tone: 'normal' | 'warning' | 'over' = 'normal'
  if (share >= 1) tone = 'over'
  else if (share >= warningAt) tone = 'warning'
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-label text-foreground">{label}</span>
        <span
          className={cn(
            'text-caption flex items-center gap-1 tabular-nums',
            tone === 'normal' && 'text-muted-foreground',
            tone === 'warning' && 'text-warning',
            tone === 'over' && 'text-destructive',
          )}
        >
          {tone !== 'normal' && <CircleAlert aria-hidden className="size-3.5" />}
          {valueText}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={valueText}
        className="bg-surface-2 h-2 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            'h-full rounded-full',
            tone === 'normal' && 'bg-primary',
            tone === 'warning' && 'bg-warning',
            tone === 'over' && 'bg-destructive',
          )}
          style={{ width: `${String(Math.min(share, 1) * 100)}%` }}
        />
      </div>
    </div>
  )
}
