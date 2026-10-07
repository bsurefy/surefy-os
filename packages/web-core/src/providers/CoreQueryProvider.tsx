// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { toast } from '@surefy/ui/components/Feedback'

import { getErrorMessage } from '../errors/getErrorMessage'
import { isApiError } from '../errors/isApiError'
import { QueryProvider } from '../query/QueryProvider'

import type { CoreErrorHandlers } from './CoreProviders.types'
import type { ReactNode } from 'react'

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).catch(() => {
    // the clipboard is unavailable (insecure context, denied permission); nothing else to do
  })
}

/**
 * The browser query client with the app's handlers plus the one error toast every app shows: the
 * translated message and, when the API returned a request ID, a "Copy details" action so the person
 * can give it to support.
 */
export function CoreQueryProvider({
  handlers,
  children,
}: Readonly<{ handlers: CoreErrorHandlers; children: ReactNode }>) {
  const tErrors = useTranslations('errors')
  const tCommon = useTranslations('common')

  const showError = (error: unknown) => {
    const message = getErrorMessage(error, tErrors)
    const requestId = isApiError(error) ? error.requestId : undefined
    if (requestId === undefined) {
      toast.error(message)
      return
    }
    toast.error(message, {
      action: {
        label: tCommon('copyDetails'),
        onClick: () => {
          copyToClipboard(tCommon('requestId', { requestId }))
        },
      },
    })
  }

  return <QueryProvider handlers={{ ...handlers, showError }}>{children}</QueryProvider>
}
