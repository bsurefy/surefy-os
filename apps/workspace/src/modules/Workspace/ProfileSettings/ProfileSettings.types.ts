// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface ProfileSettingsProps {
  orgSlug: string
  /** Sections other modules add (Vault's personal API keys), after the built-in ones. */
  children?: ReactNode
}
