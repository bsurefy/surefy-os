// SPDX-License-Identifier: AGPL-3.0-only
import type { ConfidenceThresholds } from '@surefy/ui/components/Feedback'

import type { RunTrace } from '../TestTab.types'

/** What the rows of the trace read and do; the controller of the tab owns all of it. */
export interface StepTraceView {
  orgId: string
  runId: string | null
  trace: RunTrace
  totals: {
    count: number
    durationMs: number
    tokens: number
    costMicros: number
    currency: string
  }
  longestMs: number
  thresholds: ConfidenceThresholds
  openSeqs: ReadonlySet<number>
  onToggle: (seq: number) => void
  toolsHref: string
  failedSeq: number | null
  canApprove: boolean
  isApproving: boolean
  onApprove: (approvalId: string) => void
  canRetryStep: boolean
  isRetrying: boolean
  onRetryStep: () => void
  errorOf: (code: string | null) => string
}
