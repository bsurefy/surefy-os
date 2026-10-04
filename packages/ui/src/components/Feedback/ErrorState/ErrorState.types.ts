// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface ErrorStateProps {
  /** What failed ("Couldn't load runs"). Translated text. */
  title?: string
  /** One sentence: what still works and what to do ("Try again in a moment"). */
  message: string
  /** Request ID or error digest, shown in mono and copyable for support. */
  reference?: string
  /** Code and time before the reference ("Error 503 · 10:42 UTC"). */
  details?: string
  onRetry?: () => void
  /** The shared "Try again" label when omitted. */
  retryLabel?: string
  /** "Contact support". */
  secondaryAction?: ReactNode
  /** `sm` for a section or card (partial failure), `md` for a page. */
  size?: 'sm' | 'md'
  headingLevel?: 2 | 3
  className?: string
}
