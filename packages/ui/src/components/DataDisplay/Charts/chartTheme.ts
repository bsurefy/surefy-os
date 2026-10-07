// SPDX-License-Identifier: AGPL-3.0-only
/** Categorical palette, in order; never brandable. */
export const CHART_COLORS = [1, 2, 3, 4, 5, 6].map((index) => `var(--color-chart-${String(index)})`)

export function seriesColor(color: string | undefined, index: number) {
  if (color) return `var(--color-${color})`
  return CHART_COLORS[index % CHART_COLORS.length] ?? 'var(--color-chart-1)'
}

/** Axis labels in Caption, `muted-foreground`. */
export const axisProps = {
  tick: { fill: 'var(--color-muted-foreground)', fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: 'var(--color-border)' },
} as const

export const gridProps = {
  stroke: 'var(--color-border)',
  strokeDasharray: '0',
  vertical: false,
} as const

export const defaultFormat = (value: number) => new Intl.NumberFormat().format(value)
