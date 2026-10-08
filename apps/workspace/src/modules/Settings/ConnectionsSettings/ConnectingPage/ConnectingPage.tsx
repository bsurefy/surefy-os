// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plug } from 'lucide-react'

import { ErrorState, Spinner } from '@surefy/ui/components/Feedback'

import { useConnectingPageController } from './ConnectingPage.controller'

import type { ConnectingFailure } from './ConnectingPage.controller'

type Translator = ReturnType<typeof useConnectingPageController>['t']

/** The app's own message when it gave one, else what the person can do. */
function getFailureMessage(failure: ConnectingFailure, t: Translator): string {
  if (failure.kind === 'failed') return failure.message
  if (failure.kind === 'declined') return failure.message ?? t('declined.description')
  return t('expired.description')
}

/** "Connecting…": where an app's sign-in returns to; it finishes the connection and moves on. */
export default function ConnectingPage() {
  const { t, failure, onStartAgain } = useConnectingPageController()

  if (failure) {
    return (
      <ErrorState
        title={t(`${failure.kind}.title`)}
        message={getFailureMessage(failure, t)}
        retryLabel={failure.kind === 'expired' ? t('startAgain') : t('tryAgain')}
        onRetry={onStartAgain}
      />
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 py-16 text-center"
    >
      <Plug aria-hidden className="text-muted-foreground size-8" />
      <Spinner />
      <p className="text-body">{t('connecting')}</p>
    </div>
  )
}
