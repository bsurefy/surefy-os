// SPDX-License-Identifier: AGPL-3.0-only
import { emptyStateVariants } from './EmptyState.variants'
import { cn } from '../../../lib/utils'
import { Button } from '../../../primitives/button'

import type { EmptyStateProps } from './EmptyState.types'

/** Icon tile, a heading that names the next step, one sentence of value, then the actions. */
export default function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  secondaryAction,
  note,
  headingLevel = 2,
  size,
  className,
}: Readonly<EmptyStateProps>) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const hasActions = Boolean(onAction && actionLabel) || Boolean(secondaryAction)
  return (
    <div className={cn(emptyStateVariants({ size }), className)}>
      {Icon && (
        <span className="bg-primary-soft text-primary-soft-foreground flex size-11 items-center justify-center rounded-xl">
          <Icon aria-hidden className="size-5" />
        </span>
      )}
      <div className="flex max-w-md flex-col gap-1">
        <Heading className="text-section-title text-foreground">{title}</Heading>
        {description && <p className="text-body text-foreground-secondary">{description}</p>}
      </div>
      {hasActions && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onAction && actionLabel && <Button onClick={onAction}>{actionLabel}</Button>}
          {secondaryAction}
        </div>
      )}
      {note && <p className="text-caption text-muted-foreground max-w-md">{note}</p>}
    </div>
  )
}
