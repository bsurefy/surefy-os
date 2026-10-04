// SPDX-License-Identifier: AGPL-3.0-only
'use client'

// shadcn button aligned with the component catalog (docs/design/shared/components.md, Button):
// variants primary / secondary / ghost / destructive / destructive-ghost / link; sizes 28 / 36 / 44px.
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '@surefy/ui/lib/utils'
import { Spinner } from '@surefy/ui/primitives/spinner'

import type { LucideIcon } from 'lucide-react'

const buttonVariants = cva(
  "duration-fast inline-flex shrink-0 items-center justify-center gap-2 rounded-lg whitespace-nowrap transition-colors ease-out disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'border-input bg-surface text-foreground hover:bg-surface-2 border',
        ghost: 'text-foreground-secondary hover:bg-surface-2 hover:text-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        'destructive-ghost': 'text-destructive hover:bg-destructive-soft',
        link: 'text-primary h-auto px-0 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'text-label h-7 px-2.5',
        md: 'text-body h-9 px-4 font-medium',
        lg: 'text-section-title h-11 px-5 font-medium',
        'icon-sm': 'size-7',
        'icon-md': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (for example a link) with button styles. */
    asChild?: boolean
    /**
     * Leading icon, replaced by a spinner while loading so the width does not change. Pass the
     * component (`icon={Plus}`) from client components and an element (`icon={<Plus />}`) from
     * server components, which cannot pass functions to client components.
     */
    icon?: LucideIcon | React.ReactElement<{ 'aria-hidden'?: boolean }>
    /** Shows a spinner, sets aria-busy and ignores activation. */
    isLoading?: boolean
  }

function Button({
  className,
  variant = 'primary',
  size = 'md',
  asChild = false,
  icon: Icon,
  isLoading = false,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  const isInert = isLoading || props['aria-disabled'] === true || props['aria-disabled'] === 'true'

  // aria-disabled keeps the button focusable (for its explaining tooltip) but blocks activation.
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isInert) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  let leading: React.ReactNode = null
  if (isLoading) leading = <Spinner aria-hidden="true" />
  else if (React.isValidElement(Icon)) leading = React.cloneElement(Icon, { 'aria-hidden': true })
  else if (Icon) leading = <Icon aria-hidden="true" />

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-busy={isLoading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={handleClick}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {leading}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
