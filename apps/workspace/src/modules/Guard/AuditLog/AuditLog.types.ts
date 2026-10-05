// SPDX-License-Identifier: AGPL-3.0-only
import type { auditLogSearchParams } from './AuditLog.searchParams'
import type { inferParserType } from 'nuqs'

export type AuditLogFilters = inferParserType<typeof auditLogSearchParams>
