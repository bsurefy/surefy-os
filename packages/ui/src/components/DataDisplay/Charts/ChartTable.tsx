// SPDX-License-Identifier: AGPL-3.0-only
import { defaultFormat } from './chartTheme'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../primitives/table'

import type { ChartTableProps } from './Charts.types'

/** The chart's data as a table: the accessible alternative behind the "Table" toggle. */
export default function ChartTable({
  data,
  xKey,
  xLabel,
  series,
  formatValue = defaultFormat,
  formatX,
  caption,
  className,
}: Readonly<ChartTableProps>) {
  return (
    <Table className={className}>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{xLabel}</TableHead>
          {series.map((item) => (
            <TableHead key={item.key} scope="col" className="text-right">
              {item.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((datum) => {
          const x = datum[xKey] ?? ''
          return (
            <TableRow key={String(x)}>
              <TableCell>{formatX ? formatX(x) : x}</TableCell>
              {series.map((item) => {
                const value = datum[item.key]
                return (
                  <TableCell key={item.key} className="text-right tabular-nums">
                    {typeof value === 'number' ? formatValue(value) : '—'}
                  </TableCell>
                )
              })}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
