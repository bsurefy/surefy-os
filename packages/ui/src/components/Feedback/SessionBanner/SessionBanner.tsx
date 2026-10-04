// SPDX-License-Identifier: AGPL-3.0-only
import { FlaskConical, ShieldAlert } from 'lucide-react'

import { cn } from '../../../lib/utils'

import type { SessionBannerProps } from './SessionBanner.types'

const KIND = {
  access: 'bg-foreground text-background',
  staging: 'bg-warning text-surface',
  sandbox: 'bg-info text-surface',
}

/**
 * Bar above the top bar for support or partner access and test environments. Never dismissible.
 * The app shell places it (sticky, `z-banner`); overlays still cover it.
 */
export default function SessionBanner({
  kind,
  message,
  action,
  className,
}: Readonly<SessionBannerProps>) {
  const Icon = kind === 'access' ? ShieldAlert : FlaskConical
  return (
    <div
      role="region"
      aria-label={typeof message === 'string' ? message : undefined}
      className={cn(
        'text-label flex min-h-9 items-center gap-3 px-4 py-1.5',
        KIND[kind],
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">{message}</p>
      {action}
    </div>
  )
}
