// SPDX-License-Identifier: AGPL-3.0-only
import { Check } from 'lucide-react'

import { cn } from '../../../lib/utils'

import type { StepperProps } from './Stepper.types'

/** Numbered steps for multi-step setup flows only (setup, training, offline activation). */
export default function Stepper({
  steps,
  current,
  label,
  stateLabels,
  className,
}: Readonly<StepperProps>) {
  return (
    <ol aria-label={label} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {steps.map((step, index) => {
        const isDone = index < current
        const isCurrent = index === current
        return (
          <li
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className="flex items-center gap-2"
          >
            <span
              className={cn(
                'text-label flex size-6 items-center justify-center rounded-full border tabular-nums',
                isDone && 'border-primary bg-primary text-primary-foreground',
                isCurrent && 'border-primary text-primary',
                !isDone && !isCurrent && 'border-input text-muted-foreground',
              )}
            >
              {isDone ? <Check aria-hidden="true" className="size-4" /> : index + 1}
            </span>
            <span
              className={cn(
                'text-label',
                isCurrent ? 'text-foreground' : 'text-foreground-secondary',
              )}
            >
              {step}
              {isDone && <span className="sr-only"> ({stateLabels.done})</span>}
              {isCurrent && <span className="sr-only"> ({stateLabels.current})</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
