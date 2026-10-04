// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChartLine } from 'lucide-react'
import { useState } from 'react'

import {
  BarChart,
  ChartFrame,
  ChartTable,
  EmptyState,
  LineChart,
} from '@surefy/ui/components/DataDisplay'
import { SegmentedControl } from '@surefy/ui/components/Forms'

const usage = Array.from({ length: 14 }, (_, index) => ({
  day: `Oct ${String(index + 1)}`,
  chats: 900 + Math.round(Math.sin(index / 2) * 200) + index * 20,
  runs: 300 + Math.round(Math.cos(index / 3) * 80) + index * 10,
}))
const spend = ['Support', 'Sales', 'Legal', 'Finance'].map((team, index) => ({
  team,
  openai: [420, 310, 120, 80][index] ?? 0,
  anthropic: [260, 190, 210, 40][index] ?? 0,
  local: [90, 40, 160, 20][index] ?? 0,
}))
const usageSeries = [
  { key: 'chats', label: 'Chats' },
  { key: 'runs', label: 'Agent runs' },
]
const spendSeries = [
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'local', label: 'On your server' },
]
const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
const labels = { chart: 'Chart', table: 'Table', view: 'View as' }

/** Line and stacked bar charts with the table view and their own states. */
export default function ChartsDemo() {
  const [state, setState] = useState<'ready' | 'loading' | 'empty'>('ready')
  return (
    <>
      <ChartFrame
        title="Usage per day"
        description="Last 14 days · UTC"
        labels={labels}
        state={state}
        stateContent={
          <EmptyState
            size="sm"
            headingLevel={3}
            icon={ChartLine}
            title="No usage yet"
            description="Chats and agent runs appear here once people start using SurefyOS."
          />
        }
        actions={
          <SegmentedControl
            label="Chart state"
            size="sm"
            value={state}
            onValueChange={setState}
            options={[
              { value: 'ready', label: 'Data' },
              { value: 'loading', label: 'Loading' },
              { value: 'empty', label: 'Empty' },
            ]}
          />
        }
        table={
          <ChartTable
            data={usage}
            xKey="day"
            xLabel="Day"
            series={usageSeries}
            caption="Usage per day"
          />
        }
      >
        <LineChart label="Usage per day" data={usage} xKey="day" series={usageSeries} />
      </ChartFrame>
      <ChartFrame
        title="Spend by team"
        description="This month · stacked by provider"
        labels={labels}
        table={
          <ChartTable
            data={spend}
            xKey="team"
            xLabel="Team"
            series={spendSeries}
            formatValue={money}
            caption="Spend by team"
          />
        }
      >
        <BarChart
          label="Spend by team"
          data={spend}
          xKey="team"
          series={spendSeries}
          formatValue={money}
          isStacked
        />
      </ChartFrame>
    </>
  )
}
