// SPDX-License-Identifier: AGPL-3.0-only
import { Lock } from 'lucide-react'

import { cn } from '../../../lib/utils'
import EditionBadge from '../../DataDisplay/EditionBadge'

import type { FeatureGateCardProps } from './FeatureGateCard.types'

/**
 * Shown in place of a screen whose feature is not in the edition or plan. The page frame stays;
 * the card explains the feature and the edition that includes it, over a static, non-interactive
 * preview of the screen that never shows real data.
 */
export default function FeatureGateCard({
  title,
  description,
  editionLabel,
  actions,
  note,
  preview,
  previewLabel,
  headingLevel = 2,
  className,
}: Readonly<FeatureGateCardProps>) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  // The preview and the card share one grid cell: the taller of the two sets the height.
  return (
    <div className={cn('relative isolate grid overflow-hidden rounded-xl', className)}>
      {preview && (
        <div
          inert
          aria-hidden
          data-slot="feature-gate-preview"
          className="pointer-events-none -z-10 opacity-40 blur-[2px] select-none [grid-area:1/1]"
        >
          {preview}
        </div>
      )}
      {preview && previewLabel && <span className="sr-only">{previewLabel}</span>}
      <div className="flex items-center justify-center p-6 [grid-area:1/1]">
        <div className="bg-surface border-border flex w-full max-w-lg flex-col items-start gap-4 rounded-xl border p-6 shadow-md">
          <div className="flex items-center gap-3">
            <span className="bg-surface-2 text-foreground-secondary flex size-10 items-center justify-center rounded-lg">
              <Lock aria-hidden className="size-5" />
            </span>
            <EditionBadge label={editionLabel} />
          </div>
          <div className="flex flex-col gap-1">
            <Heading className="text-section-title text-foreground">{title}</Heading>
            <p className="text-body text-foreground-secondary">{description}</p>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          {note && <p className="text-body text-muted-foreground">{note}</p>}
        </div>
      </div>
    </div>
  )
}
