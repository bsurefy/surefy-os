// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { ErrorState } from '@surefy/ui/components/Feedback'

/** A page that failed to render: the shell stays, the content area shows the error (states.md). */
export default function OrganizationError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const t = useTranslations('workspace.pageError')
  const tCommon = useTranslations('common')
  return (
    <ErrorState
      title={t('title')}
      message={t('message', { productName: tCommon('productName') })}
      reference={error.digest}
      onRetry={reset}
    />
  )
}
