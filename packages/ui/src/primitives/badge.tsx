// SPDX-License-Identifier: AGPL-3.0-only
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '@surefy/ui/lib/utils'

// Catalog badge: a 22px pill for labels (New, Beta). Statuses such as Draft use StatusPill.
const badgeVariants = cva(
  'text-caption inline-flex h-[1.375rem] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-2 text-foreground-secondary border-transparent',
        primary: 'bg-primary-soft text-primary-soft-foreground border-transparent',
        outline: 'border-border text-foreground-secondary bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

function Badge({
  className,
  variant = 'neutral',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
