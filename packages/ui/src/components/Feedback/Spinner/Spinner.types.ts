// SPDX-License-Identifier: AGPL-3.0-only
export interface SpinnerProps {
  /** 16 / 20 / 24px. Only inside buttons or small regions; pages use skeletons. */
  size?: 'sm' | 'md' | 'lg'
  /** Announced to screen readers; the shared "Loading" label when omitted. */
  label?: string
  className?: string
}
