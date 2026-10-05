// SPDX-License-Identifier: AGPL-3.0-only
import { createSerializer } from 'nuqs'

import type { AuditActorDto, AuditEntryDto, ExportParams } from '@surefy/contracts'

import { AUDIT_DATE_RANGE_MS } from './AuditLog.constants'
import { auditLogSearchParams } from './AuditLog.searchParams'

import type { AuditDateRange, AuditExportFormat } from './AuditLog.constants'
import type { AuditLogFilters } from './AuditLog.types'
import type { AuditEntryListFilters } from '@/api/audit'

const MINUTE_MS = 60_000

/**
 * The start of a preset range, rounded down to the minute so the query key stays the same while
 * the screen is open. Null for `all`.
 */
export function getRangeStart(range: AuditDateRange, now: Date): string | null {
  if (range === 'all') return null
  const start = now.getTime() - AUDIT_DATE_RANGE_MS[range]
  return new Date(Math.floor(start / MINUTE_MS) * MINUTE_MS).toISOString()
}

/** The URL's filters as the API's query; empty values are left out. */
export function toEntryQuery(filters: AuditLogFilters, now: Date): AuditEntryListFilters {
  return {
    q: filters.q || undefined,
    actorType: filters.actor ?? undefined,
    actorUserId: filters.person ?? undefined,
    action: filters.action ?? undefined,
    targetType: filters.object ?? undefined,
    outcome: filters.result ?? undefined,
    from: getRangeStart(filters.range, now) ?? undefined,
  }
}

export function hasActiveFilters(filters: AuditLogFilters): boolean {
  return (
    filters.q !== '' ||
    filters.actor !== null ||
    filters.person !== null ||
    filters.action !== null ||
    filters.object !== null ||
    filters.result !== null ||
    filters.range !== 'all'
  )
}

const serialize = createSerializer(auditLogSearchParams)

/** The link that opens one entry's detail, keeping the table's filters. */
export function getEntryHref(filters: AuditLogFilters, entryId: string): string {
  return serialize({ ...filters, entry: entryId }) || '?'
}

/** `member.role_changed` → the message path `actions.member.role_changed`. */
export function getActionMessageKey(action: string): string {
  return `actions.${action}`
}

/** Who to show when the API resolved no name: the actor type's own label. */
export function getActorFallbackKey(actor: AuditActorDto): string {
  return `actorTypes.${actor.type}`
}

/** The entry before and after `entryId` in the loaded rows, for the detail's arrows. */
export function getNeighbors(rows: readonly AuditEntryDto[], entryId: string) {
  const index = rows.findIndex((row) => row.id === entryId)
  if (index === -1) return { previous: null, next: null }
  return { previous: rows[index - 1] ?? null, next: rows[index + 1] ?? null }
}

/** The payload as shown in the detail: the metadata, pretty-printed. */
export function formatPayload(entry: AuditEntryDto): string {
  return JSON.stringify(entry.metadata, null, 2)
}

/** What an audit export carries: the table's filters, and the date range as real bounds. */
export function toExportParams(
  filters: AuditLogFilters,
  format: AuditExportFormat,
  now: Date,
  timeZone: string,
): ExportParams {
  const from = getRangeStart(filters.range, now)
  // the open entry and the range preset are not filters of the file; the range becomes bounds
  const active = Object.fromEntries(
    Object.entries(filters).filter(
      ([key, value]) => key !== 'entry' && key !== 'range' && value !== null && value !== '',
    ),
  )
  return {
    version: 1,
    format,
    filters: active,
    ...(from ? { dateRange: { from, to: now.toISOString(), timeZone } } : {}),
  }
}
