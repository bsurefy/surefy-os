// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Activity, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { PageBreadcrumb } from '@/modules/Workspace'
import { AGENT_RUN_STEP_RETENTION_DAYS } from '@surefy/contracts'
import { EmptyState, StatusPill } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState, SkeletonText } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'
import { Breadcrumbs } from '@surefy/ui/components/Navigation'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'

import { STATUS_TONE } from '../Runs.constants'
import { shortRunId } from '../Runs.utils'
import { useRunDetailController } from './RunDetail.controller'
import RunFacts from './RunFacts'
import RunSidePanel from './RunSidePanel'
import StepWaterfall from './StepWaterfall'

/**
 * Insights › Runs › one run (design/workspace/insights.md): status, the agent and version that
 * ran, Cancel while it runs and Re-run in test mode once it ended; the facts, the step waterfall
 * with time and cost per step, and why it happened, its Guard checks and approvals.
 */
export default function RunDetail() {
  const c = useRunDetailController()
  const { t, run } = c
  const tRuns = useTranslations('insights.runs')
  const title = t('title', { id: shortRunId(c.runId) })
  const crumbs = useMemo(() => [{ label: title, href: undefined }], [title])

  if (c.isLoading) return <SkeletonText lines={8} />
  if (c.isNotFound) {
    return (
      <EmptyState
        icon={Activity}
        title={t('notFound.title')}
        description={t('notFound.description')}
        secondaryAction={
          <Button variant="secondary" asChild>
            <Link href={c.runsHref}>{t('back')}</Link>
          </Button>
        }
      />
    )
  }
  if (!run) {
    return (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage ?? ''}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  }

  const agent = run.agent && !run.isAgentDeleted ? run.agent : null
  let version = <span>{tRuns('draft')}</span>
  if (run.agentVersion !== null) {
    const label = tRuns('version', { version: run.agentVersion })
    version = agent ? (
      <Link href={c.agentHref(agent.id, 'versions')} className="underline-offset-4 hover:underline">
        {label}
      </Link>
    ) : (
      <span>{label}</span>
    )
  }
  const pendingApprovalId = run.pendingApprovalIds[0]

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb items={crumbs} />
      <PageHeader
        level="object"
        title={title}
        breadcrumb={
          <Breadcrumbs
            label={t('back')}
            linkComponent={Link}
            items={[{ label: t('back'), href: c.runsHref }, { label: title }]}
          />
        }
        status={
          <StatusPill
            label={tRuns(`statuses.${run.status}`)}
            tone={STATUS_TONE[run.status]}
            isPulsing={run.status === 'running'}
          />
        }
        facts={
          <>
            {agent ? (
              <Link
                href={c.agentHref(agent.id)}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {agent.name}
              </Link>
            ) : (
              <span>{tRuns('deletedAgent')}</span>
            )}
            {version}
            <span>{tRuns(`triggers.${run.trigger}`)}</span>
            <span>
              {run.startedBy ? t('startedBy', { name: run.startedBy.name }) : tRuns('noPerson')}
            </span>
            {run.isTest && <span>{t('testRun')}</span>}
          </>
        }
        actions={
          (c.canCancel || c.canRetry) && (
            <>
              {c.canCancel && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    c.onCancelOpenChange(true)
                  }}
                >
                  {t('cancel.open')}
                </Button>
              )}
              {c.canRetry && (
                <Button icon={RotateCcw} isLoading={c.isRetrying} onClick={c.onRetry}>
                  {t('rerun.open')}
                </Button>
              )}
            </>
          )
        }
      />

      {run.retryOf && (
        <p className="text-caption text-muted-foreground">
          {t('retryOf')}{' '}
          <Link
            href={c.runHref(run.retryOf.runId)}
            className="text-primary font-mono underline-offset-4 hover:underline"
          >
            {shortRunId(run.retryOf.runId)}
          </Link>
        </p>
      )}
      {(run.status === 'failed' || run.status === 'timed_out') && (
        <Banner
          tone="destructive"
          title={t(`ended.${run.status}`)}
          description={c.errorOf(run.errorCode)}
        />
      )}
      {run.status === 'waiting_approval' && (
        <Banner
          tone="warning"
          title={t('waiting.title')}
          description={t('waiting.description')}
          action={
            pendingApprovalId && (
              <Button size="sm" variant="secondary" asChild>
                <Link href={c.approvalHref(pendingApprovalId)}>{t('waiting.open')}</Link>
              </Button>
            )
          }
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <RunFacts run={run} timeZone={c.timeZone} />
          <StepWaterfall
            orgId={c.orgId}
            runId={c.runId}
            steps={c.steps.rows}
            waterfall={c.steps.waterfall}
            isExpired={c.steps.isExpired}
            isLoading={c.steps.isLoading}
            errorMessage={c.steps.errorMessage}
            onRetry={c.steps.refetch}
            thresholds={c.thresholds}
            openSeqs={c.openSeqs}
            onToggle={c.onToggleStep}
            errorOf={c.errorOf}
            retentionDays={AGENT_RUN_STEP_RETENTION_DAYS}
            dataPrivacyHref={c.dataPrivacyHref}
          />
        </div>
        <RunSidePanel run={run} steps={c.steps.rows} approvalHref={c.approvalHref} />
      </div>

      <ConfirmDialog
        open={c.isCancelOpen}
        onOpenChange={c.onCancelOpenChange}
        tier="T2"
        tone="destructive"
        title={t('cancel.title', { id: shortRunId(c.runId) })}
        description={t('cancel.description')}
        labels={{ confirm: t('cancel.confirm') }}
        onConfirm={c.onCancel}
        error={c.cancelError}
      />
    </div>
  )
}
