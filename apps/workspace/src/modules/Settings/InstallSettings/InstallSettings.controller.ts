// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { installQueries } from '@/api/install'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { getOrganizationLimitState, hasUpdate } from './InstallSettings.utils'

/** Loads the install settings every section of Settings › Install reads. */
export function useInstallSettingsController() {
  const t = useTranslations('settings.install')
  const tErrors = useTranslations('errors')
  const { data, isPending, error, refetch } = useQuery(installQueries.settings())

  return {
    settings: data,
    isLoading: isPending,
    errorMessage: error ? getErrorMessage(error, tErrors) : null,
    errorReference: isApiError(error) ? error.requestId : undefined,
    refetch: () => void refetch(),
    hasUpdate: data ? hasUpdate(data.version) : false,
    limitState: data ? getOrganizationLimitState(data.organizations) : null,
    t,
  }
}
