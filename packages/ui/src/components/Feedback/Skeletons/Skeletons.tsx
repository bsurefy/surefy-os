// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '../../../lib/utils'
import { Skeleton } from '../../../primitives/skeleton'

import type { SkeletonCardProps, SkeletonTextProps } from './Skeletons.types'

/** Lines of text; the last one is shorter, like a paragraph. */
export function SkeletonText({ lines = 3, className }: Readonly<SkeletonTextProps>) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3.5', index === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')}
        />
      ))}
    </div>
  )
}

/** A card placeholder: title line, text lines, in the card's own frame. */
export function SkeletonCard({ lines = 2, className }: Readonly<SkeletonCardProps>) {
  return (
    <div
      aria-hidden
      className={cn(
        'border-border bg-surface flex flex-col gap-3 rounded-xl border p-5',
        className,
      )}
    >
      <Skeleton className="h-4 w-2/5" />
      <SkeletonText lines={lines} />
    </div>
  )
}
