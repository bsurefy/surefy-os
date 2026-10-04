// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useId } from 'react'

import { cn } from '../../../lib/utils'
import { Button } from '../../../primitives/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../primitives/select'

import type { LoadMoreProps, PaginationFooterProps } from './PaginationFooter.types'

/** Table footer: "1–50 of 4,812", page size, previous and next (cursor-based pages). */
export default function PaginationFooter({
  labels,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  pageSize,
  pageSizes = [25, 50, 100],
  onPageSizeChange,
  className,
}: Readonly<PaginationFooterProps>) {
  const sizeId = useId()
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 py-3', className)}>
      <p className="text-caption text-muted-foreground tabular-nums" aria-live="polite">
        {labels.range}
      </p>
      <div className="flex items-center gap-3">
        {pageSize !== undefined && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <label htmlFor={sizeId} className="text-caption text-muted-foreground">
              {labels.pageSize}
            </label>
            <Select
              value={String(pageSize)}
              onValueChange={(next) => {
                onPageSizeChange(Number(next))
              }}
            >
              <SelectTrigger id={sizeId} size="sm" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={labels.previous}
          disabled={!hasPrevious}
          onClick={onPrevious}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={labels.next}
          disabled={!hasNext}
          onClick={onNext}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

/** Cursor-based "Load more" for feeds. */
export function LoadMore({
  label,
  onLoadMore,
  isLoading = false,
  hasMore,
  className,
}: Readonly<LoadMoreProps>) {
  if (!hasMore) return null
  return (
    <div className={cn('flex justify-center py-3', className)}>
      <Button variant="secondary" isLoading={isLoading} onClick={onLoadMore}>
        {label}
      </Button>
    </div>
  )
}
