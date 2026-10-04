// SPDX-License-Identifier: AGPL-3.0-only
import { fromNodeHeaders } from 'better-auth/node'

import type {
  completeSetupRoute,
  runSetupRoute,
  setupChecklistRoute,
  setupStatusRoute,
} from './setup.schema.js'
import type { SetupService } from './setup.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type SetupStatus = typeof setupStatusRoute
type RunSetup = typeof runSetupRoute
type CompleteSetup = typeof completeSetupRoute
type SetupChecklist = typeof setupChecklistRoute

export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  status = async (_request: ZodRequest<SetupStatus>, reply: ZodReply<SetupStatus>) => {
    reply.ok(await this.setupService.status())
  }

  run = async (request: ZodRequest<RunSetup>, reply: ZodReply<RunSetup>) => {
    const { result, cookies } = await this.setupService.setup(
      request.body,
      fromNodeHeaders(request.headers),
      request.id,
    )
    if (cookies.length > 0) void reply.header('set-cookie', cookies)
    reply.created(result)
  }

  complete = async (request: ZodRequest<CompleteSetup>, reply: ZodReply<CompleteSetup>) => {
    await this.setupService.complete(request.tenant, request.body)
    reply.noContent()
  }

  checklist = async (request: ZodRequest<SetupChecklist>, reply: ZodReply<SetupChecklist>) => {
    reply.ok(await this.setupService.checklist(request.tenant))
  }
}
