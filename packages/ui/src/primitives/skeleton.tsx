// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '@surefy/ui/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'bg-border rounded-md motion-safe:animate-pulse motion-safe:[animation-duration:1.6s]',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
