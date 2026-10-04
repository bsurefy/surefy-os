// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { X } from 'lucide-react'

import { cn } from '../../../lib/utils'
import { Button } from '../../../primitives/button'

import type { BulkActionBarProps } from './BulkActionBar.types'

/** "12 selected · Change role · Deactivate · ⋯ · Clear", with "Select all 1,284 matching". */
export function BulkActionBar({
  labels,
  onClear,
  onSelectAllMatching,
  children,
  className,
}: Readonly<BulkActionBarProps>) {
  return (
    <div
      role="region"
      aria-label={labels.selected}
      className={cn(
        'border-primary/30 bg-primary-soft flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2',
        className,
      )}
    >
      <p aria-live="polite" className="text-label text-primary-soft-foreground tabular-nums">
        {labels.selected}
      </p>
      {onSelectAllMatching && labels.selectAllMatching && (
        <Button variant="link" size="sm" onClick={onSelectAllMatching}>
          {labels.selectAllMatching}
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" icon={X} onClick={onClear}>
          {labels.clear}
        </Button>
      </div>
    </div>
  )
}
