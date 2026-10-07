// SPDX-License-Identifier: AGPL-3.0-only
import { BadgeCheck } from 'lucide-react'

import { cn } from '../../../lib/utils'

import type { VerifiedBadgeProps } from './VerifiedBadge.types'

/** "Verified by a person": a seal and who approved when, linking to the audit entry. */
export default function VerifiedBadge({
  label,
  href,
  linkComponent: Link = 'a',
  className,
}: Readonly<VerifiedBadgeProps>) {
  return (
    <Link
      href={href}
      className={cn(
        'text-caption text-success-soft-foreground bg-success-soft inline-flex h-6 w-fit items-center gap-1.5 rounded-full px-2.5 font-medium whitespace-nowrap hover:underline',
        className,
      )}
    >
      <BadgeCheck aria-hidden className="size-3.5" />
      {label}
    </Link>
  )
}
