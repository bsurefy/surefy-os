// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useId, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Skeleton } from '../../../primitives/skeleton'
import SegmentedControl from '../../Forms/SegmentedControl'

import type { ChartFrameProps } from './Charts.types'

/**
 * Card around a chart: title, a Chart / Table toggle (the accessible alternative), and the chart's
 * own loading, empty and error states at the chart's height.
 */
export default function ChartFrame({
  title,
  description,
  labels,
  state = 'ready',
  stateContent,
  children,
  table,
  actions,
  height = 240,
  className,
}: Readonly<ChartFrameProps>) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const titleId = useId()
  const isReady = state === 'ready'
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'border-border bg-surface flex flex-col gap-4 rounded-xl border p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-section-title text-foreground">
            {title}
          </h2>
          {description && <p className="text-caption text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {isReady && (
            <SegmentedControl
              label={labels.view}
              size="sm"
              value={view}
              onValueChange={setView}
              options={[
                { value: 'chart', label: labels.chart },
                { value: 'table', label: labels.table },
              ]}
            />
          )}
        </div>
      </div>
      <div style={{ minHeight: height }} className="flex flex-col justify-center">
        {state === 'loading' && <Skeleton className="w-full" style={{ height }} />}
        {(state === 'empty' || state === 'error') && stateContent}
        {isReady && (view === 'chart' ? children : table)}
      </div>
    </section>
  )
}
