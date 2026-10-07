// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '../../../lib/utils'

import type { MonoTileProps } from './MonoTile.types'

const sizes = { sm: 'size-[1.625rem] rounded-md', md: 'size-7 rounded-md', lg: 'size-9 rounded-lg' }

/** A bordered square with mono initials: organizations, models, providers, file types. */
export default function MonoTile({
  size = 'md',
  className,
  children,
  ...rest
}: Readonly<MonoTileProps>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-surface-2 border-border text-foreground-secondary text-overline flex shrink-0 items-center justify-center border font-semibold tracking-normal',
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
