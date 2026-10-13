// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useNow, useTimeZone, useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  agentRunQueries,
  useCancelAgentRunMutation,
  useRetryAgentRunMutation,
} from '@/api/agentRuns'
import { guardQueries } from '@/api/guard'
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { ERROR_CODES, PERMISSIONS } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { basisPointsToShare } from '../../InsightsOverview/InsightsOverview.utils'
import { DEFAULT_CONFIDENCE_THRESHOLDS } from '../Runs.constants'
import { RUN_REFRESH_MS } from './RunDetail.constants'
import { getRunErrorMessage, isRunOpen, toWaterfall } from './RunDetail.utils'

/**
 * One run: its header, facts, step waterfall and side panel. An open run is read again every few
 * seconds until it ends. Cancel stops it (steps already done stay done); Re-run in test mode
 * starts a new run with the same input and opens it.
 */
export function useRunDetailController() {
  const t = useTranslations('insights.runs.detail')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const router = useRouter()
  const now = useNow({ updateInterval: RUN_REFRESH_MS })
  const timeZone = useTimeZone() ?? 'UTC'
  const { orgSlug, runId } = useParams<{ orgSlug: string; runId: string }>()
  const detail = useQuery({
    ...agentRunQueries.detail(orgId, runId),
    refetchInterval: (query) => (isRunOpen(query.state.data?.status) ? RUN_REFRESH_MS : false),
  })
  const isOpen = isRunOpen(detail.data?.status)
  const steps = useQuery({
    ...agentRunQueries.steps(orgId, runId),
    enabled: detail.isSuccess,
    refetchInterval: isOpen ? RUN_REFRESH_MS : false,
  })
  const guard = useQuery(guardQueries.defaults(orgId))
  const cancel = useCancelAgentRunMutation(orgId, { silent: true })
  const retry = useRetryAgentRunMutation(orgId, { silent: true })
  const mayCancel = useCan(PERMISSIONS.RUNS_CANCEL)
  const mayRetry = useCan(PERMISSIONS.RUNS_RETRY)
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [cancelError, setCancelError] = useState<string>()
  const [openSeqs, setOpenSeqs] = useState<ReadonlySet<number>>(new Set())

  const run = detail.data
  const stepRows = steps.data?.items ?? []

  return {
    t,
    orgId,
    orgSlug,
    runId,
    run,
    timeZone,
    isLoading: detail.isPending,
    isNotFound: isApiError(detail.error) && detail.error.code === ERROR_CODES.AGENT_RUN_NOT_FOUND,
    errorMessage: detail.error ? getErrorMessage(detail.error, tErrors) : null,
    errorReference: isApiError(detail.error) ? detail.error.requestId : undefined,
    refetch: () => void detail.refetch(),
    steps: {
      rows: stepRows,
      isExpired: steps.data?.stepsExpired ?? false,
      isLoading: steps.isPending,
      errorMessage: steps.error ? getErrorMessage(steps.error, tErrors) : null,
      refetch: () => void steps.refetch(),
      waterfall: toWaterfall(stepRows, now.getTime()),
    },
    thresholds: guard.data
      ? {
          low: basisPointsToShare(guard.data.reviewThresholdBp),
          high: basisPointsToShare(guard.data.autoThresholdBp),
        }
      : DEFAULT_CONFIDENCE_THRESHOLDS,
    openSeqs,
    onToggleStep: (seq: number) => {
      setOpenSeqs((current) => {
        const next = new Set(current)
        if (next.has(seq)) next.delete(seq)
        else next.add(seq)
        return next
      })
    },
    errorOf: (code: string | null) => getRunErrorMessage(code, tErrors),
    runsHref: toRoute(ROUTES.workspace.insights(orgSlug, 'runs')),
    agentHref: (agentId: string, tab?: string) =>
      toRoute(ROUTES.workspace.agent(orgSlug, agentId, tab)),
    approvalHref: (approvalId: string) => toRoute(ROUTES.workspace.approval(orgSlug, approvalId)),
    runHref: (otherRunId: string) => toRoute(ROUTES.workspace.run(orgSlug, otherRunId)),
    dataPrivacyHref: toRoute(ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.DATA_PRIVACY)),
    canCancel: mayCancel && run?.canCancel === true,
    canRetry: mayRetry && run?.canRetry === true,
    isCancelOpen,
    onCancelOpenChange: (open: boolean) => {
      setCancelError(undefined)
      setIsCancelOpen(open)
    },
    cancelError,
    onCancel: async () => {
      setCancelError(undefined)
      try {
        await cancel.mutateAsync(runId)
        toast.success(t('cancel.done'))
      } catch (error) {
        setCancelError(getErrorMessage(error, tErrors))
        throw error
      }
    },
    isRetrying: retry.isPending,
    onRetry: () => {
      retry.mutate(
        { runId, fromFailedStep: false },
        {
          onSuccess: (next) => {
            toast.success(t('rerun.started'))
            router.push(toRoute(ROUTES.workspace.run(orgSlug, next.id)))
          },
          onError: (error) => {
            toast.error(getErrorMessage(error, tErrors))
          },
        },
      )
    },
  }
}
