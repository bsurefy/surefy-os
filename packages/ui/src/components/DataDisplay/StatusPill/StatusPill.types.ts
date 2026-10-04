// SPDX-License-Identifier: AGPL-3.0-only
export type StatusTone = 'success' | 'info' | 'warning' | 'destructive' | 'neutral'

export interface StatusPillProps {
  /** The status word from the shared vocabulary ("Active", "Running", "Failed"). Translated text. */
  label: string
  tone: StatusTone
  /** Only "Running" pulses. */
  isPulsing?: boolean
  className?: string
}
