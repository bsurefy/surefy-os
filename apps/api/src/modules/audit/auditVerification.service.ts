// SPDX-License-Identifier: AGPL-3.0-only
import type { AuditIntegrityStatusDto } from '@surefy/contracts'

import { verifyJobId } from './audit.constants.js'
import { AuditVerificationRunningError } from './audit.errors.js'

import type { VerifyAuditLogPayload } from './audit.jobs.js'
import type { AuditService } from './audit.service.js'
import type { AuditContext } from './audit.types.js'
import type { Queues, JobDefinition } from '@/core/queue/index.js'

export interface AuditVerificationDeps {
  queues: Queues
  audit: AuditService
  verifyJob: JobDefinition<VerifyAuditLogPayload>
}

const RUNNING_STATES = new Set(['active', 'waiting', 'waiting-children', 'delayed', 'prioritized'])

/** Guard's on-demand "Verify": one queued or running verification per organization. */
export class AuditVerificationService {
  constructor(private readonly deps: AuditVerificationDeps) {}

  async request(ctx: AuditContext): Promise<AuditIntegrityStatusDto> {
    const jobId = verifyJobId(ctx.orgId)
    const queue = this.deps.queues.get(this.deps.verifyJob.queue)
    const existing = await queue.getJob(jobId)
    if (existing !== undefined) {
      if (RUNNING_STATES.has(await existing.getState())) throw new AuditVerificationRunningError()
      await existing.remove() // a finished run keeps its id for a day; make room for this one
    }
    await this.deps.queues.enqueue(
      this.deps.verifyJob,
      {
        orgId: ctx.orgId,
        ...(ctx.userId === null ? {} : { requestedByUserId: ctx.userId }),
      },
      { jobId },
    )
    return this.deps.audit.integrity(ctx)
  }
}
