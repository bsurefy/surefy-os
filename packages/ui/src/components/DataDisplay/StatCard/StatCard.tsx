// SPDX-License-Identifier: AGPL-3.0-only
import { ArrowDownRight, ArrowRight, ArrowUpRight, Lock } from 'lucide-react'

import { cn } from '../../../lib/utils'
import { Sparkline } from '../Charts'

import type { StatCardProps } from './StatCard.types'

const deltaIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight }
const deltaTone = {
  positive: 'text-success',
  negative: 'text-destructive',
  neutral: 'text-foreground-secondary',
}

/** KPI tile: label, value, delta with arrow and word, optional sparkline. */
export default function StatCard({
  label,
  value,
  description,
  size = 'md',
  delta,
  sparkline,
  isRestricted = false,
  restrictedLabel,
  href,
  linkComponent: Link = 'a',
  className,
}: Readonly<StatCardProps>) {
  const DeltaIcon = delta ? deltaIcon[delta.direction] : null
  const body = (
    <>
      <span className="text-caption text-muted-foreground">{label}</span>
      {isRestricted ? (
        <span className="flex items-center gap-2">
          <span className="text-page-title text-foreground">—</span>
          <span className="text-caption text-muted-foreground flex items-center gap-1">
            <Lock aria-hidden className="size-3.5" />
            {restrictedLabel}
          </span>
        </span>
      ) : (
        <span
          className={cn(
            'text-foreground tabular-nums',
            size === 'sm' ? 'text-object-title' : 'text-page-title',
          )}
        >
          {value}
        </span>
      )}
      {description && <span className="text-caption text-muted-foreground">{description}</span>}
      {!isRestricted && delta && DeltaIcon && (
        <span
          className={cn('text-caption flex items-center gap-1', deltaTone[delta.tone ?? 'neutral'])}
        >
          <DeltaIcon aria-hidden className="size-3.5" />
          {delta.label}
        </span>
      )}
      {!isRestricted && sparkline && sparkline.length > 1 && (
        <Sparkline data={sparkline} className="mt-1 h-8" />
      )}
    </>
  )
  const cardClassName = cn(
    'border-border bg-surface flex min-w-0 flex-col rounded-xl border',
    size === 'sm' ? 'gap-0.5 px-4 py-3.5' : 'gap-1 p-5',
    href && 'hover:border-input duration-fast transition-colors',
    className,
  )
  return href ? (
    <Link href={href} className={cardClassName}>
      {body}
    </Link>
  ) : (
    <div className={cardClassName}>{body}</div>
  )
}
