// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronDown, ChevronUp, Maximize2 } from 'lucide-react'

import { useUiLabels } from '../../../lib/labels'
import { Button } from '../../../primitives/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../../../primitives/sheet'

import type { SidePanelProps } from './SidePanel.types'

/** Side panel from the right: object title and close, scrolling body, sticky footer. */
export default function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  children,
  footer,
  onPrevious,
  onNext,
  fullPageHref,
  linkComponent: Link = 'a',
}: Readonly<SidePanelProps>) {
  const labels = useUiLabels()
  const hasRowNavigation = Boolean(onPrevious ?? onNext)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size={size}
        // Without a description, tell Radix there is none on purpose.
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <SheetHeader>
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <SheetTitle className="truncate">{title}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </div>
            {(hasRowNavigation || fullPageHref) && (
              <div className="-mt-0.5 flex shrink-0 items-center gap-0.5">
                {hasRowNavigation && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={labels.previous}
                      disabled={!onPrevious}
                      onClick={onPrevious}
                    >
                      <ChevronUp aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={labels.next}
                      disabled={!onNext}
                      onClick={onNext}
                    >
                      <ChevronDown aria-hidden />
                    </Button>
                  </>
                )}
                {fullPageHref && (
                  <Button variant="ghost" size="icon-sm" asChild>
                    <Link href={fullPageHref} aria-label={labels.openFullPage}>
                      <Maximize2 aria-hidden />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>
        <div className="text-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
