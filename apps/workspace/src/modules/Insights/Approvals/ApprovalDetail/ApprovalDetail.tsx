// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ListChecks } from 'lucide-react'
import Link from 'next/link'
import { useFormatter } from 'next-intl'
import { useMemo } from 'react'

import { ROUTES } from '@/constants/routes'
import { PageBreadcrumb, toRoute } from '@/modules/Workspace'
import { EmptyState, ReasoningPanel, StatusPill } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonText } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'
import { Breadcrumbs } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import { STATUS_TONE } from '../Approvals.constants'
import { useApprovalLabels } from '../Approvals.hooks'
import RejectDialog from '../RejectDialog'
import ActionSection from './ActionSection'
import { useApprovalDetailController } from './ApprovalDetail.controller'
import DecisionBanner from './DecisionBanner'
import FactsSection from './FactsSection'

/**
 * One approval: what will happen (editable fields), why the AI suggests it, the rule and the
 * decision: Approve, Edit and approve, or Reject with a reason. Above the step-up amount, approving
 * asks the person to confirm it's them first.
 */
export default function ApprovalDetail() {
  const c = useApprovalDetailController()
  const { t, item } = c
  const labels = useApprovalLabels()
  const format = useFormatter()
  const queueHref = ROUTES.workspace.insights(c.orgSlug, 'approvals')
  const crumbs = useMemo(
    () => [{ label: item?.title ?? t('back'), href: undefined }],
    [item?.title, t],
  )

  if (c.isLoading) return <SkeletonText lines={8} />
  if (c.isNotFound) {
    return (
      <EmptyState
        icon={ListChecks}
        title={t('notFound.title')}
        description={t('notFound.description')}
        secondaryAction={
          <Button variant="secondary" asChild>
            <Link href={toRoute(queueHref)}>{t('back')}</Link>
          </Button>
        }
      />
    )
  }
  if (!item) {
    return (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage ?? ''}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  }

  const isOpen = item.status === 'pending' && item.canDecide
  const reasons = 'reasoning' in item.payload ? item.payload.reasoning : []
  const sources = 'sources' in item.payload ? item.payload.sources : []

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb items={crumbs} />
      <PageHeader
        level="object"
        title={item.title}
        breadcrumb={
          <Breadcrumbs
            label={t('back')}
            linkComponent={Link}
            items={[{ label: t('back'), href: queueHref }, { label: item.title }]}
          />
        }
        status={<StatusPill label={labels.status(item.status)} tone={STATUS_TONE[item.status]} />}
        actions={
          isOpen && (
            <>
              {c.isEditing ? (
                <>
                  <Button variant="secondary" onClick={c.onStopEditing} disabled={c.isApproving}>
                    {t('actions.cancelEdit')}
                  </Button>
                  <Button isLoading={c.isApproving} onClick={c.onApprove}>
                    {t('actions.approveEdited')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      c.onRejectOpenChange(true)
                    }}
                  >
                    {t('actions.reject')}
                  </Button>
                  {c.canEdit && (
                    <Button variant="secondary" onClick={c.onStartEditing}>
                      {t('actions.editAndApprove')}
                    </Button>
                  )}
                  <Button isLoading={c.isApproving} onClick={c.onApprove}>
                    {t('actions.approve')}
                  </Button>
                </>
              )}
            </>
          )
        }
      />
      <DecisionBanner item={item} justDecided={c.justDecided} />
      {isOpen && item.requiresStepUp && (
        <p className="text-caption text-muted-foreground">{t('stepUpHint')}</p>
      )}
      {c.formError && (
        <p role="alert" className="text-body text-destructive">
          {c.formError}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <ActionSection
            item={item}
            input={c.actionInput}
            isEditing={c.isEditing}
            draft={c.draft}
            editedKeys={c.editedKeys}
            fieldErrors={c.fieldErrors}
            onDraftChange={c.onDraftChange}
          />
          {reasons.length > 0 && (
            <ReasoningPanel
              labels={{
                title: t('whyTitle'),
                sources: t('sourcesTitle'),
                run: t('seeRun'),
              }}
              reasons={reasons.map((reason) => ({
                text: reason.text,
                confidence: format.number(reason.confidence, {
                  style: 'percent',
                  maximumFractionDigits: 0,
                }),
              }))}
              runHref={
                item.agentRunId ? ROUTES.workspace.run(c.orgSlug, item.agentRunId) : undefined
              }
              linkComponent={Link}
            />
          )}
          {sources.length > 0 && (
            <section aria-label={t('sourcesTitle')} className="flex flex-col gap-2">
              <h3 className="text-section-title">{t('sourcesTitle')}</h3>
              <ul className="flex flex-col gap-1">
                {sources.map((source) => (
                  <li key={`${source.title}-${source.ref}`} className="text-body">
                    {source.title}
                    {source.ref && <span className="text-muted-foreground"> · {source.ref}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <FactsSection item={item} orgSlug={c.orgSlug} />
      </div>
      <RejectDialog
        open={c.isRejecting}
        onOpenChange={c.onRejectOpenChange}
        title={t('rejectTitle')}
        description={t('rejectDescription', { title: item.title })}
        onConfirm={c.onReject}
        error={c.rejectError}
      />
    </div>
  )
}
