// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bar, BarChart as RechartsBarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'

import { axisProps, defaultFormat, gridProps, seriesColor } from './chartTheme'
import ChartTooltip from './ChartTooltip'

import type { BarChartProps } from './Charts.types'

/** Bar or stacked bar chart on the chart palette; focusable, arrow keys move the tooltip. */
export default function BarChart({
  data,
  xKey,
  series,
  height = 240,
  formatValue = defaultFormat,
  formatX,
  label,
  isStacked = false,
  className,
}: Readonly<BarChartProps>) {
  return (
    <RechartsBarChart
      responsive
      accessibilityLayer
      role="img"
      aria-label={label}
      data={data}
      className={className}
      style={{ width: '100%', height }}
      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
    >
      <CartesianGrid {...gridProps} />
      <XAxis dataKey={xKey} {...axisProps} tickFormatter={formatX} minTickGap={16} />
      <YAxis {...axisProps} axisLine={false} tickFormatter={formatValue} width="auto" />
      <Tooltip
        cursor={{ fill: 'var(--color-surface-2)' }}
        content={(props) => (
          <ChartTooltip
            active={props.active}
            label={props.label}
            payload={props.payload}
            series={series}
            formatValue={formatValue}
            formatX={formatX}
          />
        )}
      />
      {series.map((item, index) => {
        const isTop = !isStacked || index === series.length - 1
        return (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            stackId={isStacked ? 'stack' : undefined}
            fill={seriesColor(item.color, index)}
            radius={isTop ? [3, 3, 0, 0] : 0}
            maxBarSize={32}
            isAnimationActive={false}
          />
        )
      })}
    </RechartsBarChart>
  )
}
