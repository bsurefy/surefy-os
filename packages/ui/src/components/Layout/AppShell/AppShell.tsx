// SPDX-License-Identifier: AGPL-3.0-only
import { cn } from '../../../lib/utils'

import type { AppShellProps } from './AppShell.types'

/**
 * App frame shared by the portals (docs/design/shared/layout-and-responsive.md): banner on top,
 * sidebar on the left, top bar and page content on the right, gutters 40 / 24 / 16px.
 */
export default function AppShell({
  sidebar,
  topBar,
  banner,
  width = 'reading',
  className,
  children,
  ...rest
}: Readonly<AppShellProps>) {
  return (
    <div
      className={cn(
        'bg-background flex flex-col',
        width === 'flush' ? 'h-dvh overflow-hidden' : 'min-h-dvh',
        className,
      )}
      {...rest}
    >
      {banner && <div className="z-banner sticky top-0">{banner}</div>}
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:flex">{sidebar}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          {topBar}
          <main
            id="main"
            tabIndex={-1}
            className={cn(
              'flex min-w-0 flex-1 flex-col outline-none',
              width === 'flush' ? 'min-h-0 overflow-hidden' : 'px-4 py-6 md:px-6 xl:px-10 xl:py-8',
            )}
          >
            {width === 'flush' ? (
              children
            ) : (
              /* 70rem = 1120px, the widest reading width in the layout rules; the scale has no such step. */
              <div className={cn('mx-auto w-full', width === 'reading' && 'max-w-[70rem]')}>
                {children}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
