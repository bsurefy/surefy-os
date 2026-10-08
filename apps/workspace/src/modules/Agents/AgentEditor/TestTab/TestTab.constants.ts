// SPDX-License-Identifier: AGPL-3.0-only
import {
  BrainCircuit,
  Globe,
  Hand,
  Library,
  ShieldCheck,
  Split,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import type { AgentRunStatus, AgentRunStepStatus, AgentRunStepType } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

import type { RunTrace } from './TestTab.types'

export const EMPTY_TRACE: RunTrace = {
  runId: null,
  status: null,
  errorCode: null,
  steps: [],
  approvals: {},
}

export const STEP_ICONS: Record<AgentRunStepType, LucideIcon> = {
  retrieval: Library,
  model: BrainCircuit,
  tool: Wrench,
  decision: Split,
  approval: Hand,
  guard: ShieldCheck,
  web_search: Globe,
}

export const STEP_STATUS_TONE: Record<AgentRunStepStatus, StatusTone> = {
  succeeded: 'success',
  failed: 'destructive',
  skipped: 'neutral',
  waiting: 'warning',
  blocked: 'destructive',
}

export const RUN_STATUS_TONE: Record<AgentRunStatus, StatusTone> = {
  queued: 'neutral',
  running: 'info',
  waiting_approval: 'warning',
  succeeded: 'success',
  failed: 'destructive',
  canceled: 'neutral',
  timed_out: 'destructive',
}

/** Thresholds used for confidence chips until the organization's own have loaded. */
export const DEFAULT_CONFIDENCE_THRESHOLDS = { low: 0.6, high: 0.9 } as const

export const BASIS_POINTS = 10_000
