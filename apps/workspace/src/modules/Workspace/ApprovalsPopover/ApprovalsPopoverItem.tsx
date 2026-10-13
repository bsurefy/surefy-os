// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import type { ApprovalDto } from '@surefy/contracts'
import { Button } from '@surefy/ui/primitives/button'

import { formatMicros, toRoute } from '../Workspace.utils'

import type { useFormatter } from 'next-intl'

interface ApprovalsPopoverItemProps {
  item: ApprovalDto
  orgSlug: string
  format: ReturnType<typeof useFormatter>
  now: Date
  onApprove: (item: ApprovalDto) => void
  /** Called when Review is followed, to close the popover. */
  onReview: () => void
}

/** One waiting approval: title, kind and age, amount, confidence and rule; Review, and Approve when allowed. */
export default function ApprovalsPopoverItem({
  item,
  orgSlug,
  format,
  now,
  onApprove,
  onReview,
}: Readonly<ApprovalsPopoverItemProps>) {
  const t = useTranslations('workspace.approvals')
  const tKinds = useTranslations('insights.approvals.kinds')
  const facts = [
    item.amountMicros === null ? null : formatMicros(format, item.amountMicros, item.currency),
    item.confidence === null
      ? null
      : t('confidence', {
          value: format.number(item.confidence, { style: 'percent', maximumFractionDigits: 0 }),
        }),
    item.ruleName,
  ].filter(Boolean)

  return (
    <li className="flex flex-col gap-2 rounded-md px-2.5 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body truncate font-medium">{item.title}</span>
        <span className="text-caption text-muted-foreground">
          {t('meta', {
            kind: tKinds(item.kind),
            time: format.relativeTime(new Date(item.createdAt), now),
          })}
          {item.isOverdue && <span className="text-warning"> · {t('overdue')}</span>}
        </span>
        {facts.length > 0 && (
          <span className="text-caption text-foreground-secondary">{facts.join(' · ')}</span>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" asChild>
          <Link href={toRoute(ROUTES.workspace.approval(orgSlug, item.id))} onClick={onReview}>
            {t('review')}
          </Link>
        </Button>
        {item.quickApprovable && (
          <Button
            size="sm"
            onClick={() => {
              onApprove(item)
            }}
          >
            {t('approve')}
          </Button>
        )}
      </div>
    </li>
  )
}
