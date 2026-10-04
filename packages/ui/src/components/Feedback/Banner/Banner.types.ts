// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface BannerProps {
  tone: 'info' | 'success' | 'warning' | 'destructive'
  title: string
  /** One sentence. */
  description?: ReactNode
  /** One action ("Try now", "Ask an admin"). */
  action?: ReactNode
  /** Only when the condition is not ongoing; ongoing conditions stay. */
  onDismiss?: () => void
  /** Announce the banner when it appears after the page loaded (offline, limit reached). */
  isAnnounced?: boolean
  className?: string
}
