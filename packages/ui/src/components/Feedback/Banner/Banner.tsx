// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'

import { useUiLabels } from '../../../lib/labels'
import { cn } from '../../../lib/utils'
import { Button } from '../../../primitives/button'

import type { BannerProps } from './Banner.types'

const TONE = {
  info: { icon: Info, className: 'bg-info-soft text-info-soft-foreground border-info/30' },
  success: {
    icon: CircleCheck,
    className: 'bg-success-soft text-success-soft-foreground border-success/30',
  },
  warning: {
    icon: TriangleAlert,
    className: 'bg-warning-soft text-warning-soft-foreground border-warning/30',
  },
  destructive: {
    icon: CircleAlert,
    className: 'bg-destructive-soft text-destructive-soft-foreground border-destructive/30',
  },
}

/** Full-width message at the top of a page or section: title, one sentence, one action. */
export default function Banner({
  tone,
  title,
  description,
  action,
  onDismiss,
  isAnnounced = false,
  className,
}: Readonly<BannerProps>) {
  const labels = useUiLabels()
  const { icon: Icon, className: toneClassName } = TONE[tone]
  let role: 'alert' | 'status' | undefined
  if (isAnnounced) role = tone === 'destructive' || tone === 'warning' ? 'alert' : 'status'
  return (
    <div
      role={role}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', toneClassName, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-label">{title}</p>
          {description && <p className="text-body">{description}</p>}
        </div>
        {action && <div className="mt-2 shrink-0 sm:mt-0">{action}</div>}
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={labels.dismiss}
          className="-my-1 -mr-2 text-current hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
          onClick={onDismiss}
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  )
}
