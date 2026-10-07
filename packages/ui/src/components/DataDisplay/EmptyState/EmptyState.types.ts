// SPDX-License-Identifier: AGPL-3.0-only
import type { emptyStateVariants } from './EmptyState.variants'
import type { VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface EmptyStateProps extends VariantProps<typeof emptyStateVariants> {
  /** Names the next step ("Create your first agent"), or "No results" for a search. */
  title: string
  /** One sentence of value: what will appear here. */
  description?: string
  icon?: LucideIcon
  /** Primary action; omit `onAction` when the person cannot do it and use `note` instead. */
  actionLabel?: string
  onAction?: () => void
  /** Secondary action ("Browse templates", "Clear filters"). */
  secondaryAction?: ReactNode
  /** Shown instead of the action for people who cannot act ("Ask an admin to connect a model"). */
  note?: ReactNode
  /** Heading level inside the page. Default 2. */
  headingLevel?: 2 | 3
  className?: string
}
