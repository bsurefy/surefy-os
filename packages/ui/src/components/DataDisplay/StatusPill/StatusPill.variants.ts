// SPDX-License-Identifier: AGPL-3.0-only
import { cva } from 'class-variance-authority'

export const statusPillVariants = cva(
  'text-label inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 whitespace-nowrap',
  {
    variants: {
      tone: {
        success: 'bg-success-soft text-success-soft-foreground',
        info: 'bg-info-soft text-info-soft-foreground',
        warning: 'bg-warning-soft text-warning-soft-foreground',
        destructive: 'bg-destructive-soft text-destructive-soft-foreground',
        neutral: 'bg-surface-2 text-foreground-secondary',
      },
    },
  },
)

export const statusDotVariants = cva('size-[7px] shrink-0 rounded-full', {
  variants: {
    tone: {
      success: 'bg-success',
      info: 'bg-info',
      warning: 'bg-warning',
      destructive: 'bg-destructive',
      neutral: 'bg-muted-foreground',
    },
  },
})
