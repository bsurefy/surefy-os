// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob, type JobDefinition } from '@/core/queue/index.js'

import { SEAL_AUDIT_LOG_JOB_NAME, VERIFY_AUDIT_LOG_JOB_NAME } from './audit.constants.js'

import type { AuditService } from './audit.service.js'

export const sealAuditLogPayloadSchema = z.object({})
export type SealAuditLogPayload = z.infer<typeof sealAuditLogPayloadSchema>

/** Without `orgId`, every organization with a chain (the nightly run). */
export const verifyAuditLogPayloadSchema = z.object({
  orgId: z.uuid().optional(),
  requestedByUserId: z.uuid().optional(),
})
export type VerifyAuditLogPayload = z.infer<typeof verifyAuditLogPayloadSchema>

/**
 * `maintenance` / `sealAuditLog` (scheduler `seal-audit-log`, every minute): `audit_seal` fills
 * `chain_seq` and `chain_hash` of new rows, per organization. One attempt: the next minute retries.
 */
export const createSealAuditLogJob = (audit: AuditService): JobDefinition<SealAuditLogPayload> =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: SEAL_AUDIT_LOG_JOB_NAME,
    schema: sealAuditLogPayloadSchema,
    options: { attempts: 1 },
    process: (runtime) => async () => {
      const sealed = await audit.sealPending()
      if (sealed > 0) runtime.logger.info({ sealed }, 'audit rows sealed')
    },
  })

/**
 * `maintenance` / `verifyAuditLog`: walks one organization's chain (Guard's "Verify"), or every
 * organization's (scheduler `verify-audit-nightly`). A mismatch is logged as an error: the alert.
 */
export const createVerifyAuditLogJob = (
  audit: AuditService,
): JobDefinition<VerifyAuditLogPayload> =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: VERIFY_AUDIT_LOG_JOB_NAME,
    schema: verifyAuditLogPayloadSchema,
    options: { attempts: 2 },
    process: (runtime) => async (payload) => {
      const orgIds =
        payload.orgId === undefined ? await audit.listChainOrganizations() : [payload.orgId]
      for (const orgId of orgIds) {
        const result = await audit.verify(orgId, payload.requestedByUserId ?? null)
        if (result.state === 'mismatch') {
          runtime.logger.error({ orgId, mismatch: result.mismatch }, 'audit chain mismatch')
        }
      }
    },
  })
