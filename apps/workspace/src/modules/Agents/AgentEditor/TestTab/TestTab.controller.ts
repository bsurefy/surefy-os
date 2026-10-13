// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useCancelAgentRunMutation, useRetryAgentRunMutation } from '@/api/agentRuns'
import { useApproveApprovalMutation } from '@/api/approvals'
import { guardQueries } from '@/api/guard'
import { ROUTES } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'

import { DEFAULT_CONFIDENCE_THRESHOLDS } from './TestTab.constants'
import { useTestRunStream } from './TestTab.stream'
import {
  basisPointsToShare,
  findFailedToolStep,
  getRunErrorMessage,
  isRunOpen,
  longestStepMs,
  totalsOf,
} from './TestTab.utils'

import type { TestTabProps } from './TestTab.types'

/**
 * Test: a sandbox conversation with the saved draft and the trace of the latest run. The draft is
 * saved before a message is sent, so the test reads what is on screen. A step that waits for an
 * approval offers "Approve as tester"; a failed tool step offers "Retry step".
 */
export function useTestTabController({ agent, definition, isReadOnly, onFlush }: TestTabProps) {
  const t = useTranslations('agents.editor.test')
  const tErrors = useTranslations('errors')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const orgId = useCurrentOrgId()
  const canRetry = useCan(PERMISSIONS.RUNS_RETRY)
  const canDecide = useCan(PERMISSIONS.APPROVALS_DECIDE)
  const stream = useTestRunStream(orgId, agent.id)
  const settings = useQuery(guardQueries.defaults(orgId))
  const approve = useApproveApprovalMutation(orgId)
  const retry = useRetryAgentRunMutation(orgId)
  const cancel = useCancelAgentRunMutation(orgId)
  const [text, setText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [notSaved, setNotSaved] = useState(false)
  const [openSeqs, setOpenSeqs] = useState<ReadonlySet<number>>(new Set())

  const { trace } = stream
  const isBusy = stream.activity !== 'idle'
  const trimmed = text.trim()
  const canSend = !isReadOnly && !isBusy && !isSaving && trimmed !== ''
  const failedStep = findFailedToolStep(trace.steps)

  const send = async (message: string) => {
    if (isReadOnly || isBusy || isSaving || message.trim() === '') return
    setIsSaving(true)
    const revision = await onFlush()
    setIsSaving(false)
    setNotSaved(revision === null)
    if (revision === null) return
    setText('')
    stream.send(message.trim())
  }

  const onApprove = async (approvalId: string) => {
    try {
      await approve.mutateAsync({ approvalId })
    } catch {
      // the mutation shows why; the step keeps waiting
      return
    }
    // the stream ends after a while of waiting: the run goes on and is followed again
    if (stream.activity === 'idle') stream.reconnect()
  }

  const onRetryStep = async () => {
    if (!trace.runId) return
    try {
      const run = await retry.mutateAsync({ runId: trace.runId, fromFailedStep: true })
      stream.follow(run.id)
    } catch {
      // the mutation shows why
    }
  }

  const onStop = () => {
    stream.stop()
    if (trace.runId && isRunOpen(trace.status)) {
      cancel.mutate(trace.runId, { onSuccess: () => toast.info(t('stopped')) })
    }
  }

  const thresholds = settings.data
    ? {
        low: basisPointsToShare(settings.data.reviewThresholdBp),
        high: basisPointsToShare(settings.data.autoThresholdBp),
      }
    : DEFAULT_CONFIDENCE_THRESHOLDS

  const toggleStep = (seq: number) => {
    setOpenSeqs((current) => {
      const next = new Set(current)
      if (next.has(seq)) next.delete(seq)
      else next.add(seq)
      return next
    })
  }

  return {
    t,
    tErrors,
    orgId,
    agentId: agent.id,
    messages: stream.messages,
    starters: definition.conversationStarters,
    activity: stream.activity,
    isSaving,
    notSaved,
    isReadOnly,
    composer: {
      text,
      onTextChange: setText,
      canSend,
      onSend: () => void send(text),
      onStarter: (starter: string) => void send(starter),
      onStop,
      onClear: () => {
        stream.clear()
        setOpenSeqs(new Set())
      },
      canClear: stream.messages.length > 0 && !isReadOnly,
    },
    failureMessage:
      trace.errorCode || stream.hasFailed ? getRunErrorMessage(trace.errorCode, tErrors) : null,
    errorOf: (code: string | null) => getRunErrorMessage(code, tErrors),
    trace: {
      value: trace,
      totals: totalsOf(trace.steps),
      longestMs: longestStepMs(trace.steps),
      thresholds,
      openSeqs,
      onToggle: toggleStep,
      toolsHref: ROUTES.workspace.agent(orgSlug, agent.id, 'tools'),
      failedSeq: failedStep?.seq ?? null,
      canApprove: canDecide && !isReadOnly,
      isApproving: approve.isPending,
      onApprove: (approvalId: string) => void onApprove(approvalId),
      canRetryStep: canRetry && !isReadOnly && !isRunOpen(trace.status),
      isRetrying: retry.isPending,
      onRetryStep: () => void onRetryStep(),
    },
  }
}
