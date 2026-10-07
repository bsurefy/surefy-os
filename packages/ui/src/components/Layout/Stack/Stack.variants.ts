// SPDX-License-Identifier: AGPL-3.0-only
import { cva } from 'class-variance-authority'

/** Spacing steps from the 4px scale (docs/design/shared/foundations.md, section 4). */
export const stackVariants = cva('flex', {
  variants: {
    direction: { column: 'flex-col', row: 'flex-row items-center' },
    gap: { 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 5: 'gap-5', 6: 'gap-6', 8: 'gap-8' },
  },
  defaultVariants: { direction: 'column', gap: 4 },
})
