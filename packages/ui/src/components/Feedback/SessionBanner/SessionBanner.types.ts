// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface SessionBannerProps {
  /**
   * `access`: support or delegated partner access; `staging` and `sandbox`: a non-production
   * Console environment.
   */
  kind: 'access' | 'staging' | 'sandbox'
  /** Who, why and until when ("Support (Lena K.) is viewing this organization · Ticket 4821 · until 14:30"). */
  message: ReactNode
  /** "End session". */
  action?: ReactNode
  className?: string
}
