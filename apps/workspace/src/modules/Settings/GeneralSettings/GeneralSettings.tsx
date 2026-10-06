// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ErrorState, SkeletonForm } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'

import { useGeneralSettingsController } from './GeneralSettings.controller'
import GeneralSettingsForm from './GeneralSettingsForm'

/** Settings › General: name, address, time zone and default language. */
export default function GeneralSettings() {
  const { organization, isLoading, errorMessage, errorReference, refetch, t } =
    useGeneralSettingsController()

  let content
  if (isLoading)
    content = (
      <div className="flex flex-col gap-6">
        <SkeletonForm fields={2} columns={2} />
        <SkeletonForm fields={2} columns={2} />
      </div>
    )
  else if (errorMessage || !organization) {
    content = (
      <ErrorState
        title={t('general.loadError')}
        message={errorMessage ?? t('general.loadError')}
        reference={errorReference}
        onRetry={refetch}
        size="sm"
      />
    )
  } else content = <GeneralSettingsForm organization={organization} />

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('sections.general')} description={t('general.description')} />
      <section aria-busy={isLoading || undefined}>{content}</section>
    </div>
  )
}
