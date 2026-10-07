// SPDX-License-Identifier: AGPL-3.0-only
import { useId } from 'react'

import { cn } from '../../../lib/utils'

import type { SectionProps } from './Section.types'

/** A titled block of a page: a card (border, no shadow, 20px padding) or plain. */
export default function Section({
  title,
  description,
  actions,
  isPlain = false,
  className,
  children,
  ...rest
}: Readonly<SectionProps>) {
  const titleId = useId()
  const hasHeader = Boolean(title ?? description ?? actions)
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={cn(
        'flex flex-col gap-4',
        !isPlain && 'border-border bg-surface rounded-xl border p-4 md:p-5',
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {title && (
              <h2 id={titleId} className="text-section-title text-foreground">
                {title}
              </h2>
            )}
            {description && <p className="text-body text-foreground-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
