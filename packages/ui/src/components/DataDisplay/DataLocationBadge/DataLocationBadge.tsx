// SPDX-License-Identifier: AGPL-3.0-only
import { CloudUpload, Server } from 'lucide-react'

import { cn } from '../../../lib/utils'

import type { DataLocationBadgeProps } from './DataLocationBadge.types'

/** Where the data went, on chat answers, runs and knowledge bases. */
export default function DataLocationBadge({
  location,
  label,
  size = 'sm',
  className,
}: Readonly<DataLocationBadgeProps>) {
  const Icon = location === 'local' ? Server : CloudUpload
  return (
    <span
      className={cn(
        'text-caption inline-flex w-fit items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'md' ? 'h-[1.625rem] px-2.5' : 'h-[1.375rem] px-2',
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
