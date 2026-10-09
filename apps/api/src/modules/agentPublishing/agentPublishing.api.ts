// SPDX-License-Identifier: AGPL-3.0-only
import { orgKey } from '@/core/cache/keys.js'
import { ForbiddenError, TooManyRequestsError } from '@/core/errors/index.js'
import {
  AgentRunAgentNotFoundError,
  AgentRunAgentNotPublishedError,
  AgentRunAgentPausedError,
} from '@/modules/agentRuns/index.js'
import { ERROR_CODES } from '@surefy/contracts'
import type { PublicRunDto, PublicRunInput } from '@surefy/contracts'

import { API_CHANNEL_DEFAULT_RATE_PER_MINUTE } from './agentPublishing.constants.js'

import type { Idempotency } from './agentPublishing.idempotency.js'
import type { AgentChannelsRepository } from './agentPublishing.repository.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type {
  AgentRunsContext,
  AgentRunsQueries,
  AgentRunsService,
  RunRow,
  AgentRunsAgents,
} from '@/modules/agentRuns/index.js'

export interface ApiChannelDeps {
  db: Database
  cache: Pick<Cache, 'client'>
  repository: AgentChannelsRepository
  agents: Pick<AgentRunsAgents, 'findById'>
  runs: Pick<AgentRunsService, 'start'>
  queries: Pick<AgentRunsQueries, 'getPublic' | 'access'>
  idempotency: Idempotency
  now?: () => Date
}

export interface StartedApiRun {
  run: RunRow
  /** `true` when the call returned the run of an earlier call with the same `Idempotency-Key`. */
  repeated: boolean
}

/**
 * The API channel (backend/agent-runs.md, §3): an organization API key with `agents:invoke` starts
 * a run of a published agent whose API channel is active. It starts runs and never executes them.
 */
export class ApiChannel {
  private readonly now: () => Date

  constructor(private readonly deps: ApiChannelDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async start(
    ctx: AgentRunsContext,
    agentId: string,
    body: PublicRunInput,
    idempotencyKey: string | undefined,
  ): Promise<StartedApiRun> {
    // the agent first: one that is not in this organization is a 404 for everyone
    const channel = await this.channelOf(ctx, agentId)
    // the public run routes are for API keys; a signed-in person starts runs from Chat or the Test tab
    const keyId = ctx.apiKey?.id
    if (keyId === undefined) {
      throw new ForbiddenError(ERROR_CODES.ACCESS_FORBIDDEN, 'An API key is required')
    }
    if (idempotencyKey === undefined) return this.begin(ctx, agentId, body, channel)

    const started = await this.deps.idempotency.begin(ctx.orgId, keyId, idempotencyKey, {
      agentId,
      body,
    })
    if (started.kind === 'repeat') {
      return { run: await this.deps.queries.access(ctx, started.resourceId), repeated: true }
    }
    try {
      const result = await this.begin(ctx, agentId, body, channel)
      await started.finish(result.run.id)
      return result
    } catch (error) {
      await started.release()
      throw error
    }
  }

  /** The public view of a run, for the response. */
  view(ctx: AgentRunsContext, runId: string): Promise<PublicRunDto> {
    return this.deps.queries.getPublic(ctx, runId)
  }

  private async begin(
    ctx: AgentRunsContext,
    agentId: string,
    body: PublicRunInput,
    channel: { id: string; ratePerMinute: number },
  ): Promise<StartedApiRun> {
    await this.limit(ctx.orgId, channel)
    const messages = body.messages ?? [{ role: 'user' as const, text: body.input ?? '' }]
    const run = await this.deps.runs.start(ctx, {
      agentId,
      trigger: 'api',
      channelId: channel.id,
      input: {
        messages,
        ...(body.metadata === undefined ? {} : { metadata: body.metadata }),
      },
    })
    return { run, repeated: false }
  }

  /** The agent's active API channel; a published agent without one is not reachable here. */
  private async channelOf(
    ctx: AgentRunsContext,
    agentId: string,
  ): Promise<{ id: string; ratePerMinute: number }> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.deps.agents.findById(tx, ctx.orgId, agentId)
      if (agent?.deletedAt !== null) throw new AgentRunAgentNotFoundError()
      if (agent.liveVersionId === null) throw new AgentRunAgentNotPublishedError()
      const channel = await this.deps.repository.find(tx, ctx.orgId, agentId, 'api')
      if (channel === undefined || channel.status === 'disconnected') {
        throw new AgentRunAgentNotPublishedError()
      }
      if (channel.status !== 'active') throw new AgentRunAgentPausedError()
      return {
        id: channel.id,
        ratePerMinute:
          channel.config.api?.rateLimitPerMinute ?? API_CHANNEL_DEFAULT_RATE_PER_MINUTE,
      }
    })
  }

  /** A fixed one-minute window per channel; the answer says when the next one opens. */
  private async limit(
    orgId: string,
    channel: { id: string; ratePerMinute: number },
  ): Promise<void> {
    const minute = Math.floor(this.now().getTime() / 60_000)
    const key = orgKey(orgId, 'agent-channel', channel.id, 'rate', minute)
    try {
      const count = await this.deps.cache.client.incr(key)
      if (count === 1) await this.deps.cache.client.expire(key, 120)
      if (count > channel.ratePerMinute) {
        throw new TooManyRequestsError(undefined, 'This agent is called too often', {
          details: [{ limitPerMinute: channel.ratePerMinute }],
        })
      }
    } catch (error) {
      // Redis down: the limit is skipped, the run is not refused for it
      if (error instanceof TooManyRequestsError) throw error
    }
  }
}
