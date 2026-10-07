// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { Toaster as SonnerToaster } from 'sonner'

import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useUiLabels } from '../../../lib/labels'

import type { ToasterProps } from './Toast.types'

/**
 * Mounted once per app (in the core providers): bottom-right, bottom-center on mobile, at most 3
 * stacked, Alt+T moves focus to the toasts, never steals focus on its own.
 */
export default function Toaster({ theme = 'system' }: Readonly<ToasterProps>) {
  const labels = useUiLabels()
  const isMobile = useMediaQuery('(max-width: 767px)')
  return (
    <SonnerToaster
      theme={theme}
      position={isMobile ? 'bottom-center' : 'bottom-right'}
      visibleToasts={3}
      hotkey={['altKey', 'KeyT']}
      containerAriaLabel={labels.notifications}
      icons={{
        success: <CircleCheck aria-hidden className="text-success size-4" />,
        info: <Info aria-hidden className="text-info size-4" />,
        warning: <TriangleAlert aria-hidden className="text-warning size-4" />,
        error: <CircleAlert aria-hidden className="text-destructive size-4" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'border-border bg-surface text-foreground flex w-full items-start gap-3 rounded-lg border p-4 shadow-lg md:w-[356px]',
          title: 'text-label',
          description: 'text-body text-foreground-secondary',
          icon: 'mt-0.5',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          actionButton:
            'text-label text-primary hover:bg-primary-soft -my-1 shrink-0 rounded-md px-2 py-1',
        },
      }}
    />
  )
}
