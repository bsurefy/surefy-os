// SPDX-License-Identifier: AGPL-3.0-only
import type { AuditEntryDto, AuditMetadata } from '@surefy/contracts'

import type { AuditLogRow } from './audit.repository.js'

const hex = (value: Buffer | null): string | null => (value === null ? null : value.toString('hex'))

/** Old or foreign rows without a version still read as `AuditMetadata` v1. */
const toMetadata = (value: AuditMetadata | Record<string, unknown>): AuditMetadata => ({
  ...value,
  version: 1,
})

export function toAuditEntryDto(
  row: AuditLogRow,
  labels: { actorName: string | null; targetLabel: string | null },
): AuditEntryDto {
  return {
    id: row.id,
    actor: {
      type: row.actorType,
      userId: row.actorUserId,
      apiKeyId: row.actorApiKeyId,
      refId: row.actorRefId,
      name: labels.actorName,
    },
    via: row.via,
    accessGrantId: row.accessGrantId,
    partnerId: row.partnerId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    targetLabel: labels.targetLabel,
    outcome: row.outcome,
    metadata: toMetadata(row.metadata),
    reason: row.reason,
    modelKey: row.modelKey,
    confidence: row.confidence,
    requestId: row.requestId,
    ip: row.ip,
    userAgent: row.userAgent,
    integrity: {
      entryHash: row.entryHash.toString('hex'),
      chainSeq: row.chainSeq,
      chainHash: hex(row.chainHash),
      sealedAt: row.sealedAt?.toISOString() ?? null,
    },
    createdAt: row.createdAt.toISOString(),
  }
}
