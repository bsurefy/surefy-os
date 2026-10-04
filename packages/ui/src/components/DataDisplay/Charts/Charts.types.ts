// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

/** One row per x value: `{ day: '2026-10-01', chats: 120, runs: 40 }`. */
export type ChartDatum = Record<string, string | number | null>

export interface ChartSeries {
  /** Key of the value in each datum. */
  key: string
  /** Legend, tooltip and table header. Translated text. */
  label: string
  /** A status color for status charts (`success`, `destructive`…); the chart palette by default. */
  color?: string
}

export interface CartesianChartProps {
  data: ChartDatum[]
  /** Key of the x value in each datum. */
  xKey: string
  series: ChartSeries[]
  /** Chart height in px. Default 240. */
  height?: number
  /** Formats y values for the axis and tooltip (locale, units). */
  formatValue?: (value: number) => string
  /** Formats x values for the axis and tooltip (dates in the person's time zone). */
  formatX?: (value: string | number) => string
  /** Accessible name of the chart ("Chats per day"). */
  label: string
  className?: string
}

export interface BarChartProps extends CartesianChartProps {
  isStacked?: boolean
}

export interface ChartFrameLabels {
  /** Toggle labels: "Chart", "Table". */
  chart: string
  table: string
  /** Name of the toggle ("View as"). */
  view: string
}

export interface ChartFrameProps {
  title: string
  description?: string
  labels: ChartFrameLabels
  /** Loading, empty or error replace the chart; each is passed in so the caller owns its text. */
  state?: 'ready' | 'loading' | 'empty' | 'error'
  /** Shown for `empty` (usually EmptyState size sm) and `error` (ErrorState). */
  stateContent?: ReactNode
  /** The chart. */
  children: ReactNode
  /** The same data as a table (ChartTable): the accessible alternative. */
  table: ReactNode
  /** Extra controls in the header (period filter). */
  actions?: ReactNode
  /** Height of the chart area, so states do not make the layout jump. Default 240. */
  height?: number
  className?: string
}

export interface ChartTableProps {
  data: ChartDatum[]
  xKey: string
  /** Header of the x column ("Day"). */
  xLabel: string
  series: ChartSeries[]
  formatValue?: (value: number) => string
  formatX?: (value: string | number) => string
  /** Accessible name ("Chats per day"). */
  caption: string
  className?: string
}
