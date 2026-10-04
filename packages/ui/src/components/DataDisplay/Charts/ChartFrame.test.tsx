// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import ChartFrame from './ChartFrame'
import ChartTable from './ChartTable'

const data = [
  { day: 'Oct 1', chats: 1200, runs: 40 },
  { day: 'Oct 2', chats: 1350, runs: null },
]
const series = [
  { key: 'chats', label: 'Chats' },
  { key: 'runs', label: 'Runs' },
]
const labels = { chart: 'Chart', table: 'Table', view: 'View as' }

describe('ChartFrame', () => {
  it('switches to the table view, the accessible alternative', async () => {
    render(
      <ChartFrame
        title="Usage"
        labels={labels}
        table={
          <ChartTable data={data} xKey="day" xLabel="Day" series={series} caption="Usage per day" />
        }
      >
        <div>chart</div>
      </ChartFrame>,
    )
    expect(screen.getByRole('region', { name: 'Usage' })).toHaveTextContent('chart')
    await userEvent.click(screen.getByRole('radio', { name: 'Table' }))
    const table = screen.getByRole('table', { name: 'Usage per day' })
    expect(table).toHaveTextContent('1,350')
    expect(screen.getAllByRole('cell', { name: '—' })).toHaveLength(1)
  })

  it('shows its own loading and empty states without the toggle', () => {
    const { rerender } = render(
      <ChartFrame title="Usage" labels={labels} state="loading" table={null}>
        <div>chart</div>
      </ChartFrame>,
    )
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByText('chart')).not.toBeInTheDocument()
    rerender(
      <ChartFrame
        title="Usage"
        labels={labels}
        state="empty"
        stateContent={<p>No usage yet</p>}
        table={null}
      >
        <div>chart</div>
      </ChartFrame>,
    )
    expect(screen.getByText('No usage yet')).toBeInTheDocument()
  })
})
