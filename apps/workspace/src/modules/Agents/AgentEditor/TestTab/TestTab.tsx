// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import StepTrace from './StepTrace'
import TestChat from './TestChat'
import { useTestTabController } from './TestTab.controller'

import type { TestTabProps } from './TestTab.types'

/** Test: a sandbox chat with the draft on one side, the steps of its latest run on the other. */
export default function TestTab(props: Readonly<TestTabProps>) {
  const c = useTestTabController(props)
  const { trace } = c

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <TestChat
        messages={c.messages}
        starters={c.starters}
        activity={c.activity}
        isSaving={c.isSaving}
        notSaved={c.notSaved}
        isReadOnly={c.isReadOnly}
        failureMessage={c.failureMessage}
        composer={c.composer}
      />
      <StepTrace
        view={{
          orgId: c.orgId,
          runId: trace.value.runId,
          trace: trace.value,
          totals: trace.totals,
          longestMs: trace.longestMs,
          thresholds: trace.thresholds,
          openSeqs: trace.openSeqs,
          onToggle: trace.onToggle,
          toolsHref: trace.toolsHref,
          failedSeq: trace.failedSeq,
          canApprove: trace.canApprove,
          isApproving: trace.isApproving,
          onApprove: trace.onApprove,
          canRetryStep: trace.canRetryStep,
          isRetrying: trace.isRetrying,
          onRetryStep: trace.onRetryStep,
          errorOf: c.errorOf,
        }}
      />
    </div>
  )
}
