// SPDX-License-Identifier: AGPL-3.0-only
import type { DataRequestDto, ExportDto, UserRefDto } from '@surefy/contracts'

import type { DataRequestRow, ExportRow } from './dataControl.repository.js'

const iso = (value: Date | null): string | null => value?.toISOString() ?? null

export function toDataRequestDto(
  row: DataRequestRow,
  requestedBy: UserRefDto | null,
): DataRequestDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    requestedVia: row.requestedVia,
    requestedBy,
    reason: row.reason,
    sizeBytes: row.sizeBytes,
    expiresAt: iso(row.expiresAt),
    scheduledFor: iso(row.scheduledFor),
    errorCode: row.errorCode,
    deliveredAt: iso(row.deliveredAt),
    canceledAt: iso(row.canceledAt),
    canceledByUserId: row.canceledByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toExportDto(row: ExportRow): ExportDto {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    params: row.params,
    containsPersonalData: row.containsPersonalData,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    rowCount: row.rowCount,
    attempts: row.attempts,
    errorCode: row.errorCode,
    expiresAt: iso(row.expiresAt),
    downloadedAt: iso(row.downloadedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
