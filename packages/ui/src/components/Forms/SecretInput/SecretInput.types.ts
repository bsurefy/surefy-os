// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps, ReactNode } from 'react'

export interface SecretInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** Translated "Show" / "Hide" labels of the toggle. */
  labels: { show: string; hide: string }
  /**
   * An action next to the field, usually "Test connection". A saved secret is never sent back:
   * leave the field empty and say what is stored in the placeholder ("Saved · ends in 4f2a").
   */
  action?: ReactNode
}
