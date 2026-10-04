// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CircleAlert, CircleCheck, FileText, RotateCw, X } from 'lucide-react'

import { cn } from '../../../lib/utils'
import { Button } from '../../../primitives/button'
import { Progress } from '../../../primitives/progress'

import type { FileUploadListProps } from './FileUploadList.types'

/** Picked files with per-file progress, error and retry. */
export default function FileUploadList({
  items,
  labels,
  onRetry,
  isRetryable = () => true,
  onRemove,
  className,
}: Readonly<FileUploadListProps>) {
  if (items.length === 0) return null
  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {items.map((item) => {
        const isError = item.status === 'error'
        const errorId = `${item.id}-error`
        return (
          <li
            key={item.id}
            aria-describedby={isError ? errorId : undefined}
            className={cn(
              'bg-surface flex items-center gap-3 rounded-lg border px-3 py-2',
              isError ? 'border-destructive/40' : 'border-border',
            )}
          >
            <FileText aria-hidden className="text-muted-foreground size-5 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-body text-foreground truncate">{item.name}</span>
                <span className="text-caption text-muted-foreground shrink-0 tabular-nums">
                  {item.size}
                </span>
              </div>
              {item.status === 'uploading' && (
                <Progress
                  value={item.progress ?? 0}
                  aria-label={`${labels.uploading} ${item.name}`}
                  className="h-1"
                />
              )}
              {item.status === 'done' && (
                <span className="text-caption text-success flex items-center gap-1">
                  <CircleCheck aria-hidden className="size-3.5" />
                  {labels.done}
                </span>
              )}
              {isError && (
                <span id={errorId} className="text-caption text-destructive flex items-start gap-1">
                  <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                  {item.error}
                </span>
              )}
            </div>
            {isError && onRetry && isRetryable(item) && (
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCw}
                onClick={() => {
                  onRetry(item.id)
                }}
              >
                {labels.retry}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={labels.remove(item.name)}
              onClick={() => {
                onRemove(item.id)
              }}
            >
              <X aria-hidden />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
