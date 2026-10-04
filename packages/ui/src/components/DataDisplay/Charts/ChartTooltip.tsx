// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { ChartSeries } from './Charts.types'

interface TooltipEntry {
  dataKey?: unknown
  value?: unknown
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  label?: string | number
  payload?: readonly TooltipEntry[]
  series: ChartSeries[]
  formatValue: (value: number) => string
  formatX?: (value: string | number) => string
}

/** Tooltip in the design-system style; also shown when the chart is moved with the arrow keys. */
export default function ChartTooltip({
  active,
  label,
  payload,
  series,
  formatValue,
  formatX,
}: Readonly<ChartTooltipProps>) {
  if (!active || !payload?.length || label === undefined) return null
  return (
    <div className="border-border bg-surface text-caption rounded-lg border px-3 py-2 shadow-md">
      <p className="text-foreground mb-1 font-medium">{formatX ? formatX(label) : label}</p>
      <ul className="flex flex-col gap-0.5">
        {payload.map((entry) => {
          const item = series.find((candidate) => candidate.key === entry.dataKey)
          if (!item || typeof entry.value !== 'number') return null
          return (
            <li key={item.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: entry.color }}
              />
              <span className="text-foreground-secondary">{item.label}</span>
              <span className="text-foreground ml-auto pl-4 tabular-nums">
                {formatValue(entry.value)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
