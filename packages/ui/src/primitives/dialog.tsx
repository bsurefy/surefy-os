// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import * as React from 'react'

import { useUiLabels } from '@surefy/ui/lib/labels'
import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 z-overlay bg-scrim fixed inset-0',
        className,
      )}
      {...props}
    />
  )
}

// Catalog widths: sm 400, md 520, lg 640; 64px from the top; header and footer set off by lines,
// only the body scrolls, also when the body and footer sit inside a `<form>`. The close button sits
// 40% outside the corner from `sm` up.
function DialogContent({
  className,
  children,
  size = 'md',
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: 'sm' | 'md' | 'lg'
  showCloseButton?: boolean
}) {
  const labels = useUiLabels()
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-size={size}
        className={cn(
          'bg-surface border-border data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 z-overlay motion-reduce:data-[state=open]:zoom-in-100 fixed top-16 left-[50%] flex max-h-[calc(100dvh-8rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] flex-col rounded-xl border shadow-lg data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=open]:ease-[cubic-bezier(0.34,1.56,0.64,1)] data-[size=lg]:sm:max-w-[640px] data-[size=md]:sm:max-w-[520px] data-[size=sm]:sm:max-w-[400px] [&>form]:flex [&>form]:min-h-0 [&>form]:flex-col',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="group/close border-border bg-surface text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background focus-visible:outline-ring absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full border shadow-md duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] disabled:pointer-events-none motion-safe:transition-[background-color,color,border-color,scale] motion-safe:hover:scale-110 motion-safe:active:scale-90 sm:top-0 sm:right-0 sm:translate-x-[40%] sm:-translate-y-[40%] [&_svg]:pointer-events-none"
          >
            <XIcon className="size-4 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-safe:transition-transform motion-safe:group-hover/close:rotate-90" />
            <span className="sr-only">{labels.close}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'border-border flex flex-col gap-1.5 border-b px-6 pt-6 pr-12 pb-4 sm:pr-6',
        className,
      )}
      {...props}
    />
  )
}

/** The only part that scrolls: content between the header and footer lines. */
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn('text-body flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5', className)}
      {...props}
    />
  )
}

/** Footer on `surface-2`, actions right-aligned, Cancel left of the primary. */
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  const labels = useUiLabels()
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'border-border bg-surface-2 flex flex-col-reverse gap-2 rounded-b-xl border-t px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="secondary">{labels.close}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-object-title text-foreground', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-body text-foreground-secondary', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
