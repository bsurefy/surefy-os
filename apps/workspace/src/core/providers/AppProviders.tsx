// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { TooltipProvider } from '@surefy/ui/primitives/tooltip'
import { allAccessQueries } from '@surefy/web-core/api/access'
import { openSessionExpired } from '@surefy/web-core/auth'
import { CoreProviders } from '@surefy/web-core/providers'
import type { CoreErrorHandlers, CoreProvidersProps } from '@surefy/web-core/providers'
import { getQueryClient } from '@surefy/web-core/query'

import { SessionExpiry } from './SessionExpiry'

export type AppProvidersProps = Omit<CoreProvidersProps, 'handlers'>

/** The workspace's side effects of the global error handlers (error-handling.md §3). */
const handlers: CoreErrorHandlers = {
  onUnauthenticated: openSessionExpired,
  // FEATURE_NOT_AVAILABLE: refresh effective access, so the screen shows the upgrade card
  onFeatureUnavailable: () => {
    void getQueryClient().invalidateQueries(allAccessQueries)
  },
}

/**
 * Every provider of the workspace, mounted once by the root layout: the core providers (intl,
 * query client, theme, nuqs, toaster) with the workspace's handlers, the tooltip provider and the
 * session-expired dialog.
 */
export function AppProviders({ children, ...core }: Readonly<AppProvidersProps>) {
  return (
    <CoreProviders {...core} handlers={handlers}>
      <TooltipProvider>
        {children}
        <SessionExpiry />
      </TooltipProvider>
    </CoreProviders>
  )
}
