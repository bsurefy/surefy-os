// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '../../../lib/utils'

import type { TagProps } from './Tag.types'

/** 20px mono tag for versions, `MCP` and ID prefixes. */
export default function Tag({ children, className }: Readonly<TagProps>) {
  return (
    <span
      className={cn(
        'border-border bg-surface-2 text-foreground-secondary text-caption inline-flex h-5 w-fit items-center rounded-sm border px-1.5 font-mono whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  )
}
