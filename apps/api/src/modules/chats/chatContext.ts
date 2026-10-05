// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenError } from '@/core/errors/index.js'

import type { ModelCallContext, ModelCallMeter } from '@/modules/modelGateway/index.js'
import type { TenantContext } from '@/types/context.js'

/** The signed-in person. Chats belong to people, so an actor without one (a system job) is refused. */
export function requireUser(ctx: TenantContext): string {
  if (ctx.userId === null) throw new ForbiddenError()
  return ctx.userId
}

/** The model call context of a person's chat: their teams and the models access allows them. */
export function modelCallContext(
  ctx: TenantContext,
  options: { isPrivateChat: boolean; meter: ModelCallMeter },
): ModelCallContext {
  return {
    orgId: ctx.orgId,
    userId: ctx.userId,
    teamIds: ctx.teamIds,
    primaryTeamId: ctx.access.primaryTeamId,
    allowedModelIds: ctx.access.allowedModelIds,
    caller: 'chat',
    isPrivateChat: options.isPrivateChat,
    requestId: ctx.requestId,
    apiKeyId: ctx.apiKey?.id ?? null,
    meter: options.meter,
  }
}
