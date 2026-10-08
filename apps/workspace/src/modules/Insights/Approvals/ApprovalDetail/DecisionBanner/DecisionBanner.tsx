// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { ApprovalDetailDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'

import { useApprovalLabels } from '../../Approvals.hooks'

interface DecisionBannerProps {
  item: ApprovalDetailDto
  /** This person's decision just went through. */
  justDecided: boolean
}

/**
 * The state of an item that is not open for this person: decided (by whom), timed out with the
 * action taken, withdrawn, or assigned to others and read-only.
 */
export default function DecisionBanner({ item, justDecided }: Readonly<DecisionBannerProps>) {
  const t = useTranslations('insights.approvals.detail')
  const format = useFormatter()
  const labels = useApprovalLabels()
  const time = item.decidedAt
    ? format.dateTime(new Date(item.decidedAt), { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  if (item.status === 'approved' || item.status === 'rejected') {
    return <DecidedBanner item={item} time={time} justDecided={justDecided} />
  }
  if (item.status === 'expired') {
    const action = item.timeoutAction ? t(`timeoutActions.${item.timeoutAction}`) : ''
    return <Banner tone="warning" title={t('banners.expired', { time, action })} isAnnounced />
  }
  if (item.status === 'canceled') return <Banner tone="info" title={t('banners.canceled')} />
  if (!item.canDecide) {
    return <Banner tone="info" title={t('banners.readOnly', { names: labels.assignees(item) })} />
  }
  return null
}

/** "Omar already approved this", or the plain result of this person's own decision. */
function DecidedBanner({
  item,
  time,
  justDecided,
}: Readonly<DecisionBannerProps & { time: string }>) {
  const t = useTranslations('insights.approvals.detail')
  const labels = useApprovalLabels()
  const outcome = item.status === 'approved' ? 'approved' : 'rejected'
  const ownTitle = t(item.editedPayload ? 'decided.approvedEdited' : `decided.${outcome}`)
  const title = justDecided
    ? ownTitle
    : t('banners.decided', { name: item.decidedBy?.name ?? '', outcome })
  const reason = item.decisionReason
    ? [labels.reason(item.decisionReason), item.decisionNote].filter(Boolean).join(' · ')
    : null
  const description = [
    t('banners.decidedAt', { time }),
    reason ? t('banners.decidedReason', { reason }) : null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Banner
      tone={outcome === 'approved' ? 'success' : 'info'}
      title={title}
      description={description}
      isAnnounced
    />
  )
}
