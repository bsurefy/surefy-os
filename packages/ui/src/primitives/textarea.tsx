// SPDX-License-Identifier: AGPL-3.0-only
import * as React from 'react'

import { cn } from '@surefy/ui/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40 focus-visible:border-ring focus-visible:ring-ring aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive flex field-sizing-content min-h-[5.25rem] w-full rounded-lg border bg-transparent px-3 py-2 text-base transition-[color,box-shadow] outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
