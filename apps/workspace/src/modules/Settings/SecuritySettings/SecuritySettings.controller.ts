// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { organizationQueries } from '@/api/organizations'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

/** Loads the organization for the Security form. */
export function useSecuritySettingsController() {
  const t = useTranslations('settings.security')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const { data, isPending, error, refetch } = useQuery(organizationQueries.detail(orgId))

  return {
    organization: data,
    orgSlug,
    isLoading: isPending,
    errorMessage: error ? getErrorMessage(error, tErrors) : null,
    errorReference: isApiError(error) ? error.requestId : undefined,
    refetch: () => void refetch(),
    t,
  }
}
