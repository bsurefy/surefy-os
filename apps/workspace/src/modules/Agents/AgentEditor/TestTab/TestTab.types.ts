// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentRunApprovalData,
  AgentRunGuardData,
  AgentRunStatus,
  AgentRunStatusData,
  AgentRunStepEvent,
  AgentRunUsageData,
} from '@surefy/contracts'

import type { AgentTabProps } from '../AgentEditor.types'
import type { UIMessage } from 'ai'

/** What the Test tab needs on top of the shared tab props: a test reads the saved draft, so pending edits are saved first. */
export interface TestTabProps extends AgentTabProps {
  /** Saves what is pending; the revision the draft is at then, or null when it could not be saved. */
  onFlush: () => Promise<number | null>
}

/** The SurefyOS data chunks of a run's event stream (`data-<name>`), typed for `useChat`. */
export interface TestRunDataParts {
  run: AgentRunStatusData
  step: AgentRunStepEvent
  guard: AgentRunGuardData
  'approval-required': AgentRunApprovalData
  usage: AgentRunUsageData
  [name: string]: unknown
}

export type TestUiMessage = UIMessage<never, TestRunDataParts>

/** The step trace of the run on screen, built from its event stream. */
export interface RunTrace {
  runId: string | null
  status: AgentRunStatus | null
  errorCode: string | null
  /** In the order they happened. */
  steps: AgentRunStepEvent[]
  /** The approval a waiting step asks for, by step number. */
  approvals: Record<number, AgentRunApprovalData>
}

/** One data chunk as `useChat` hands it over. */
export interface RunDataChunk {
  type: string
  data: unknown
}

export type TestActivity = 'idle' | 'starting' | 'running'
