// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { auditQueries } from '@/api/audit'
import type { AuditEntryDto } from '@surefy/contracts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

/** One entry: the table's row at once, then the API's copy (a shared link has no row yet). */
export function useAuditEntryDetailController(
  orgId: string,
  entryId: string,
  row: AuditEntryDto | undefined,
) {
  const t = useTranslations('guard.auditLog.detail')
  const tErrors = useTranslations('errors')
  const query = useQuery({ ...auditQueries.entry(orgId, entryId), placeholderData: row })

  return {
    entry: query.data,
    isLoading: query.isPending,
    errorMessage: query.error ? getErrorMessage(query.error, tErrors) : null,
    errorReference: isApiError(query.error) ? query.error.requestId : undefined,
    refetch: () => void query.refetch(),
    t,
  }
}
