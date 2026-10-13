// SPDX-License-Identifier: AGPL-3.0-only
import { BrainCircuit, Globe, Hand, Library, ShieldCheck, Split, Wrench } from 'lucide-react'

import type { AgentRunStepStatus, AgentRunStepType, GuardOutcome } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

import type { LucideIcon } from 'lucide-react'

/** An open run is read again this often, so its steps and status follow the worker. */
export const RUN_REFRESH_MS = 3000

/** The narrowest bar of the waterfall, as a share of the run, so instant steps stay visible. */
export const MIN_BAR_SHARE = 0.01

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

export const GUARD_OUTCOME_TONE: Record<GuardOutcome, StatusTone> = {
  auto: 'success',
  double_check: 'info',
  human: 'warning',
  blocked: 'destructive',
}
