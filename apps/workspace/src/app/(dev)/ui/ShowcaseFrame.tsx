// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@surefy/ui/primitives/button'
import { TooltipProvider } from '@surefy/ui/primitives/tooltip'

import type { ReactNode } from 'react'

/** Frame of the design-system showcase pages: theme switch and the tooltip provider. */
export default function ShowcaseFrame({ children }: Readonly<{ children: ReactNode }>) {
  const [isDark, setIsDark] = useState(false)

  const handleToggleTheme = () => {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    setIsDark(next)
  }

  return (
    <TooltipProvider>
      <div className="bg-background text-foreground min-h-dvh">
        <div className="z-frame border-border bg-surface sticky top-0 flex items-center justify-between border-b px-6 py-3">
          <p className="text-overline text-muted-foreground">
            Design system showcase (development only)
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={isDark ? Sun : Moon}
            onClick={handleToggleTheme}
          >
            {isDark ? 'Light' : 'Dark'}
          </Button>
        </div>
        {children}
      </div>
    </TooltipProvider>
  )
}
