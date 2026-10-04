// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface FeatureGateCardProps {
  /** "Single sign-on is part of SurefyOS Enterprise". */
  title: string
  /** What the feature does, in one or two sentences. */
  description: string
  /** The edition that includes it ("Enterprise", "Cloud"), shown as the edition badge. */
  editionLabel: string
  /** Links or buttons for people who can act: "Compare editions", "Enter license key", "See plans". */
  actions?: ReactNode
  /** Shown to people who cannot act: "Ask an owner to upgrade". */
  note?: ReactNode
  /** A static picture of the screen behind the card. Rendered inert and hidden from assistive tech. */
  preview?: ReactNode
  /** Names the preview for screen readers ("Preview of Single sign-on"); only used with `preview`. */
  previewLabel?: string
  /** Heading level inside the page. Default 2. */
  headingLevel?: 2 | 3
  className?: string
}
