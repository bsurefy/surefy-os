// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '../../../lib/utils'

import type { IconTileProps } from './IconTile.types'

const sizes = {
  sm: 'size-[1.875rem] rounded-lg [&_svg]:size-4',
  md: 'size-9 rounded-[0.5625rem] [&_svg]:size-[1.125rem]',
  lg: 'size-11 rounded-xl [&_svg]:size-5',
}
const tones = {
  primary: 'bg-primary-soft text-primary-soft-foreground',
  neutral: 'bg-surface-2 text-foreground-secondary',
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  destructive: 'bg-destructive-soft text-destructive-soft-foreground',
}

/** A soft rounded square holding one icon; decorative, the text beside it carries the meaning. */
export default function IconTile({
  icon: Icon,
  size = 'md',
  tone = 'primary',
  className,
}: Readonly<IconTileProps>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center [&_svg]:shrink-0',
        sizes[size],
        tones[tone],
        className,
      )}
    >
      <Icon />
    </span>
  )
}
