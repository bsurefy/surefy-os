// SPDX-License-Identifier: AGPL-3.0-only
import type { Theme } from './providers.constants'
import type { QueryClientHandlers } from '../query/query.types'
import type { AbstractIntlMessages } from 'next-intl'
import type { ReactNode } from 'react'

/** The app's side effects of the global error handlers; the error toast itself is built by `CoreProviders`. */
export type CoreErrorHandlers = Omit<QueryClientHandlers, 'showError'>

export interface CoreProvidersProps {
  /** From `getLocale()` in the root layout. */
  locale: string
  /** From `getMessages()` in the root layout: the shared namespaces plus the app's own. */
  messages: AbstractIntlMessages
  /** The person's IANA time zone, when known; otherwise the browser's is used. */
  timeZone?: string
  /** Opens the session-expired dialog, invalidates effective access. */
  handlers: CoreErrorHandlers
  /** The theme before the person chooses one; "system" follows the OS. */
  defaultTheme?: Theme
  children: ReactNode
}
