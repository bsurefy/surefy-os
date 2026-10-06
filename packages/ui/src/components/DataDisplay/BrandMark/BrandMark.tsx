// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '../../../lib/utils'

import type { BrandMarkProps } from './BrandMark.types'

/** The product mark: a primary rounded square with a check, optionally with the wordmark. */
export default function BrandMark({
  size = 28,
  wordmark,
  accent,
  label,
  className,
}: Readonly<BrandMarkProps>) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-flex shrink-0 items-center gap-2.5', className)}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
        <rect x="2" y="2" width="44" height="44" rx="13" className="fill-primary" />
        <path
          d="M14.5 24.5l6.5 6.5 13-14"
          fill="none"
          className="stroke-primary-foreground"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {wordmark && (
        <span className="text-body-lg text-foreground font-semibold tracking-[-0.01em] whitespace-nowrap">
          {wordmark}
          {accent && <span className="text-primary">{accent}</span>}
        </span>
      )}
    </span>
  )
}
