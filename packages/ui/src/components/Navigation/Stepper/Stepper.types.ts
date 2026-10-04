// SPDX-License-Identifier: AGPL-3.0-only
export interface StepperProps {
  /** Step labels, in order. Translated text. */
  steps: string[]
  /** Zero-based index of the current step. */
  current: number
  /** Accessible name of the step list ("Setup steps"). Translated text. */
  label: string
  /** Screen-reader words for finished and current steps. Translated text. */
  stateLabels: { done: string; current: string }
  className?: string
}
