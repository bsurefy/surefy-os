// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useUiLabels } from '../../../lib/labels'
import { cn } from '../../../lib/utils'
import { Spinner as SpinnerIcon } from '../../../primitives/spinner'

import type { SpinnerProps } from './Spinner.types'

const SIZE = { sm: 'size-4', md: 'size-5', lg: 'size-6' }

/** Spinner for a small region, with a status label for screen readers. */
export default function Spinner({ size = 'sm', label, className }: Readonly<SpinnerProps>) {
  const labels = useUiLabels()
  return (
    <span role="status" className={cn('text-muted-foreground inline-flex', className)}>
      <SpinnerIcon aria-hidden className={SIZE[size]} />
      <span className="sr-only">{label ?? labels.loading}</span>
    </span>
  )
}
