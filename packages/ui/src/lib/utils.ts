// SPDX-License-Identifier: AGPL-3.0-only
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge that knows the design-system text styles. Without this, `text-page-title` and
 * `text-foreground` both start with `text-` and one of them would be dropped.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'page-title',
            'object-title',
            'section-title',
            'body-lg',
            'body',
            'label',
            'caption',
            'overline',
            'code',
          ],
        },
      ],
      z: [{ z: ['sticky', 'frame', 'overlay', 'popover', 'toast', 'banner'] }],
    },
  },
})

/** Merges class names; the consumer's `className` always goes last. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
