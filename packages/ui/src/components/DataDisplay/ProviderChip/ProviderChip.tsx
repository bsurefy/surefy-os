// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '../../../lib/utils'
import { statusDotVariants, type StatusTone } from '../StatusPill'

import type { ProviderChipProps, ProviderStatus } from './ProviderChip.types'

const STATUS_TONE: Record<ProviderStatus, StatusTone> = {
  connected: 'success',
  'rate-limited': 'warning',
  expiring: 'warning',
  error: 'destructive',
  'not-connected': 'neutral',
}

/** Provider initial tile, name, status dot and word. Dashed outline: no key yet. */
export default function ProviderChip({
  name,
  status,
  statusLabel,
  isLocal = false,
  className,
}: Readonly<ProviderChipProps>) {
  const hasKey = status !== 'not-connected'
  return (
    <span
      className={cn(
        'text-label inline-flex h-8 w-fit items-center gap-2 rounded-lg border pr-2.5 pl-1 whitespace-nowrap',
        hasKey ? 'border-border' : 'border-input border-dashed',
        isLocal ? 'bg-success-soft' : 'bg-surface',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-6 items-center justify-center rounded-md font-semibold',
          isLocal ? 'bg-success text-surface' : 'bg-surface-2 text-foreground',
        )}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="text-foreground">{name}</span>
      <span className="text-caption text-foreground-secondary flex items-center gap-1.5">
        <span aria-hidden className={statusDotVariants({ tone: STATUS_TONE[status] })} />
        {statusLabel}
      </span>
    </span>
  )
}
