// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { organizationQueries } from '@/api/organizations'
import { budgetQueries } from '@/api/usage'
import { PERMISSIONS } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import type { OpenBudgetDialog } from './UsageBudgetsSettings.types'

/**
 * Settings › Usage & budgets: the organization budget, the organization's currency for new
 * budgets, who may change them and the open dialog. The team and personal lists load themselves.
 */
export function useUsageBudgetsSettingsController() {
  const t = useTranslations('settings.usage')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const canManage = useCan(PERMISSIONS.BUDGETS_MANAGE)
  const [dialog, setDialog] = useState<OpenBudgetDialog | null>(null)

  const organization = useInfiniteQuery(budgetQueries.list(orgId, { scope: 'organization' }))
  const organizationBudget = organization.data?.pages[0]?.items[0] ?? null
  const details = useQuery(organizationQueries.detail(orgId))

  return {
    orgId,
    orgSlug,
    canManage,
    organizationBudget,
    isLoading: organization.isPending,
    errorMessage: organization.error ? getErrorMessage(organization.error, tErrors) : null,
    errorReference: isApiError(organization.error) ? organization.error.requestId : undefined,
    refetch: () => void organization.refetch(),
    /** New budgets take the organization's currency; an existing one already names it. */
    currency: organizationBudget?.currency ?? details.data?.currency ?? null,
    dialog,
    openDialog: setDialog,
    closeDialog: () => {
      setDialog(null)
    },
    t,
  }
}
