// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '../../../lib/utils'
import { Skeleton } from '../../../primitives/skeleton'

import type {
  SkeletonCardProps,
  SkeletonFormProps,
  SkeletonRowsProps,
  SkeletonStatProps,
  SkeletonTextProps,
} from './Skeletons.types'

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

/** List rows the height of the real ones, with an optional leading circle and one or two bars. */
export function SkeletonRows({
  rows = 5,
  hasLeading = false,
  lines = 1,
  rowClassName = 'h-11',
  className,
}: Readonly<SkeletonRowsProps>) {
  return (
    <div aria-hidden className={cn('flex flex-col', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cn('flex items-center gap-3 px-3', rowClassName)}>
          {hasLeading && <Skeleton className="size-7 shrink-0 rounded-full" />}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={cn('h-3.5', index % 3 === 1 ? 'w-2/5' : 'w-3/5')} />
            {lines === 2 && <Skeleton className="h-3 w-1/4" />}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Form fields: a label bar over a 36px field bar, in one or two columns, inside the card frame. */
export function SkeletonForm({
  fields = 3,
  columns = 1,
  hasFrame = true,
  className,
}: Readonly<SkeletonFormProps>) {
  return (
    <div
      aria-hidden
      className={cn(
        'grid gap-4',
        columns === 2 && 'md:grid-cols-2',
        hasFrame && 'border-border bg-surface rounded-xl border p-5',
        className,
      )}
    >
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}

/** A stat card placeholder: label, value and hint bars at the card's size. */
export function SkeletonStat({ size = 'md', className }: Readonly<SkeletonStatProps>) {
  return (
    <div
      aria-hidden
      className={cn(
        'border-border bg-surface flex flex-col rounded-xl border',
        size === 'sm' ? 'gap-1.5 px-4 py-3.5' : 'gap-2 p-5',
        className,
      )}
    >
      <Skeleton className="h-3 w-20" />
      <Skeleton className={size === 'sm' ? 'h-6 w-14' : 'h-7 w-20'} />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}
