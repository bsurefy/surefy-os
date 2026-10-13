// SPDX-License-Identifier: AGPL-3.0-only
import type { STATUS_FILTERS } from './RunsTab.constants'
import type { AgentTabProps } from '../AgentEditor.types'

/** The runs of the agent are read on their own; the tab only needs to know which agent it is. */
export type RunsTabProps = Pick<AgentTabProps, 'agent'>

export interface RunsTabFilters {
  q: string
  status: (typeof STATUS_FILTERS)[number] | null
  human: boolean
  test: boolean
}
