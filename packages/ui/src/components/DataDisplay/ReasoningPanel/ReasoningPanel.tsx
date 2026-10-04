// SPDX-License-Identifier: AGPL-3.0-only
import { ArrowRight, FileText, Sparkles } from 'lucide-react'
import { useId } from 'react'

import { cn } from '../../../lib/utils'

import type { ReasoningPanelProps } from './ReasoningPanel.types'

/** "Why the AI suggests this": reasons with their confidence, sources and the full run. */
export default function ReasoningPanel({
  labels,
  reasons,
  sources = [],
  runHref,
  linkComponent: Link = 'a',
  headingLevel = 3,
  className,
}: Readonly<ReasoningPanelProps>) {
  const titleId = useId()
  const Heading = `h${String(headingLevel)}` as 'h3'
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'border-border bg-surface-2 flex flex-col gap-3 rounded-lg border p-4',
        className,
      )}
    >
      <Heading id={titleId} className="text-label text-foreground flex items-center gap-1.5">
        <Sparkles aria-hidden className="text-primary size-4" />
        {labels.title}
      </Heading>
      <ul className="flex flex-col gap-2">
        {reasons.map((reason) => (
          <li key={reason.text} className="text-body text-foreground flex items-start gap-2">
            <span aria-hidden className="bg-muted-foreground mt-2 size-1 shrink-0 rounded-full" />
            <span className="flex-1">{reason.text}</span>
            {reason.confidence && (
              <span className="text-caption text-foreground-secondary font-mono tabular-nums">
                {reason.confidence}
              </span>
            )}
          </li>
        ))}
      </ul>
      {sources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-caption text-muted-foreground font-medium">{labels.sources}</p>
          <ul className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <li key={source.href}>
                <Link
                  href={source.href}
                  className="border-border bg-surface text-caption text-foreground hover:border-input inline-flex h-6 items-center gap-1 rounded-md border px-2"
                >
                  <FileText aria-hidden className="size-3.5" />
                  {source.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {runHref && labels.run && (
        <Link
          href={runHref}
          className="text-label text-primary flex w-fit items-center gap-1 hover:underline"
        >
          {labels.run}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      )}
    </section>
  )
}
