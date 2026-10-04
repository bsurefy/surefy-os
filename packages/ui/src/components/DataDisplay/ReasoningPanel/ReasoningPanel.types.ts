// SPDX-License-Identifier: AGPL-3.0-only
import type { ElementType } from 'react'

export interface Reason {
  /** One reason in plain words. */
  text: string
  /** Its confidence, formatted ("92%"). */
  confidence?: string
}

export interface ReasoningSource {
  label: string
  href: string
}

export interface ReasoningPanelLabels {
  /** "Why the AI suggests this". */
  title: string
  /** "Sources". */
  sources: string
  /** "See the full run". */
  run?: string
}

export interface ReasoningPanelProps {
  labels: ReasoningPanelLabels
  reasons: Reason[]
  sources?: ReasoningSource[]
  /** Link to the full run. */
  runHref?: string
  linkComponent?: ElementType
  /** Heading level inside the page. Default 3. */
  headingLevel?: 2 | 3 | 4
  className?: string
}
