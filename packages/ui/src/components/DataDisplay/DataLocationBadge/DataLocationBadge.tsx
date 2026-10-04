// SPDX-License-Identifier: AGPL-3.0-only
import { CloudUpload, Server } from 'lucide-react'

import { cn } from '../../../lib/utils'

import type { DataLocationBadgeProps } from './DataLocationBadge.types'

/** Where the data went, on chat answers, runs and knowledge bases. */
export default function DataLocationBadge({
  location,
  label,
  className,
}: Readonly<DataLocationBadgeProps>) {
  const Icon = location === 'local' ? Server : CloudUpload
  return (
    <span
      className={cn(
        'text-caption inline-flex h-[1.375rem] w-fit items-center gap-1 rounded-full px-2 font-medium whitespace-nowrap',
        location === 'local'
          ? 'bg-success-soft text-success-soft-foreground'
          : 'bg-surface-2 text-foreground-secondary',
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {label}
    </span>
  )
}
