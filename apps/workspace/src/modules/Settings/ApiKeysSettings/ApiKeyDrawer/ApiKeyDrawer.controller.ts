// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'

import { apiKeyQueries } from '@/api/apiKeys'
import { ROUTES } from '@/constants/routes'
import type { ApiKeyDto } from '@surefy/contracts'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getApiKeyRowStatus } from '../ApiKeysSettings.utils'

const AUDIT_LOG_TARGET = 'api_key'

/** The detail drawer: what the key carries, who made it, and the agents that use it. */
export function useApiKeyDrawerController(orgId: string, apiKey: ApiKeyDto) {
  const t = useTranslations('settings.apiKeys')
  const tScopes = useTranslations('settings.apiKeys.scopes')
  const tErrors = useTranslations('errors')
  const format = useFormatter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const status = getApiKeyRowStatus(apiKey)
  // a revoked key serves nothing, so there is nothing to look up
  const usage = useQuery({
    ...apiKeyQueries.impact(orgId, apiKey.id),
    enabled: status !== 'revoked',
  })

  return {
    status,
    usedBy: usage.data?.listed.filter((item) => item.type === 'agent') ?? [],
    isUsageLoading: usage.isPending && status !== 'revoked',
    usageError: usage.error ? getErrorMessage(usage.error, tErrors) : null,
    retryUsage: () => void usage.refetch(),
    agentHref: (agentId: string) => ROUTES.workspace.agent(orgSlug, agentId),
    auditLogHref: {
      pathname: ROUTES.workspace.guard(orgSlug, 'audit-log'),
      query: { object: AUDIT_LOG_TARGET },
    },
    formatDate: (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' }),
    formatRelative: (iso: string) => format.relativeTime(new Date(iso)),
    t,
    tScopes,
  }
}
