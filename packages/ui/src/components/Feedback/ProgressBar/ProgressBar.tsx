// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { cn } from '../../../lib/utils'
import { Progress } from '../../../primitives/progress'

import type { ProgressBarProps } from './ProgressBar.types'

/** Determinate progress with its label and percentage: uploads, ingestion, exports. */
export default function ProgressBar({
  label,
  value,
  valueText,
  className,
}: Readonly<ProgressBarProps>) {
  const text = valueText ?? `${String(Math.round(value))}%`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-label text-foreground">{label}</span>
        <span className="text-caption text-muted-foreground tabular-nums">{text}</span>
      </div>
      <Progress value={value} aria-label={label} aria-valuetext={text} />
    </div>
  )
}
