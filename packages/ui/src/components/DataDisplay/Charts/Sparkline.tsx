// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Line, LineChart } from 'recharts'

import { cn } from '../../../lib/utils'

/** Decorative trend line: the value it illustrates is always in the text next to it. */
export default function Sparkline({
  data,
  color = 'var(--color-chart-1)',
  className,
}: Readonly<{ data: number[]; color?: string; className?: string }>) {
  const points = data.map((value, index) => ({ index, value }))
  return (
    <div aria-hidden className={cn('h-8 w-full', className)}>
      <LineChart
        responsive
        accessibilityLayer={false}
        data={points}
        style={{ width: '100%', height: '100%' }}
        margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
      >
        <Line
          dataKey="value"
          type="monotone"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  )
}
