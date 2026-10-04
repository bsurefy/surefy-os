// SPDX-License-Identifier: AGPL-3.0-only
import { cva } from 'class-variance-authority'

export const emptyStateVariants = cva(
  'flex flex-col items-center justify-center gap-3 text-center',
  {
    variants: { size: { sm: 'py-6', md: 'py-12', lg: 'py-20' } },
    defaultVariants: { size: 'md' },
  },
)
