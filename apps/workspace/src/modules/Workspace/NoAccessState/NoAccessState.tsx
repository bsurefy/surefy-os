// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Lock } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@surefy/ui/primitives/button'

import { useNoAccessStateController } from './NoAccessState.controller'

import type { NoAccessArea } from '../Workspace.types'

/**
 * The page-level permission-denied state (states.md): what the page is, the person's role, who to
 * ask. Rendered by a page whose server check (`checkPageAccess`) failed; never a 404.
 */
export default function NoAccessState({ area }: Readonly<{ area: NoAccessArea }>) {
  const { title, explanation, askAdmin, homeHref, homeLabel } = useNoAccessStateController({
    area,
  })

  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center">
      <span
        aria-hidden="true"
        className="bg-surface-2 text-foreground-secondary flex size-12 items-center justify-center rounded-xl"
      >
        <Lock className="size-6" />
      </span>
      <h1 className="text-page-title">{title}</h1>
      <p className="text-body text-foreground-secondary">{explanation}</p>
      <p className="text-body text-foreground-secondary">{askAdmin}</p>
      <Button asChild variant="secondary" className="mt-2">
        <Link href={homeHref}>{homeLabel}</Link>
      </Button>
    </section>
  )
}
