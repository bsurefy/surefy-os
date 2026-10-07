// SPDX-License-Identifier: AGPL-3.0-only
import { Loader2Icon } from 'lucide-react'

import { cn } from '@surefy/ui/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
