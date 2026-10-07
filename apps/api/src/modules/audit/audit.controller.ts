// SPDX-License-Identifier: AGPL-3.0-only
import type {
  getAuditEntryRoute,
  getAuditIntegrityRoute,
  listAuditEntriesRoute,
  verifyAuditRoute,
} from './audit.schema.js'
import type { AuditService } from './audit.service.js'
import type { AuditVerificationService } from './auditVerification.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListEntries = typeof listAuditEntriesRoute
type GetEntry = typeof getAuditEntryRoute
type GetIntegrity = typeof getAuditIntegrityRoute
type Verify = typeof verifyAuditRoute

export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly verification: AuditVerificationService,
  ) {}

  list = async (request: ZodRequest<ListEntries>, reply: ZodReply<ListEntries>) => {
    const { items, nextCursor } = await this.auditService.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  get = async (request: ZodRequest<GetEntry>, reply: ZodReply<GetEntry>) => {
    reply.ok(await this.auditService.get(request.tenant, request.params.entryId))
  }

  integrity = async (request: ZodRequest<GetIntegrity>, reply: ZodReply<GetIntegrity>) => {
    reply.ok(await this.auditService.integrity(request.tenant))
  }

  verify = async (request: ZodRequest<Verify>, reply: ZodReply<Verify>) => {
    const status = await this.verification.request(request.tenant)
    await reply.status(202).send({ data: status })
  }
}
