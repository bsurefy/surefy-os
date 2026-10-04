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
        <span className="text-page-title text-foreground tabular-nums">{value}</span>
      )}
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
    'border-border bg-surface flex min-w-0 flex-col gap-1 rounded-xl border p-5',
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
