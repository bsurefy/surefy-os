// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { axisProps, defaultFormat, gridProps, seriesColor } from './chartTheme'
import ChartTooltip from './ChartTooltip'

import type { CartesianChartProps } from './Charts.types'

/** Line chart on the chart palette; focusable, and the arrow keys move the tooltip. */
export default function LineChart({
  data,
  xKey,
  series,
  height = 240,
  formatValue = defaultFormat,
  formatX,
  label,
  className,
}: Readonly<CartesianChartProps>) {
  return (
    <RechartsLineChart
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
        cursor={{ stroke: 'var(--color-border)' }}
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
      {series.map((item, index) => (
        <Line
          key={item.key}
          dataKey={item.key}
          name={item.label}
          type="monotone"
          stroke={seriesColor(item.color, index)}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      ))}
    </RechartsLineChart>
  )
}
