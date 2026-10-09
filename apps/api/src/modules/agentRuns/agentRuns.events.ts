// SPDX-License-Identifier: AGPL-3.0-only
import { orgKey } from '@/core/cache/keys.js'
import { AGENT_RUN_EVENT_MAX_LENGTH, AGENT_RUN_EVENT_TTL_SECONDS } from '@surefy/contracts'

import type { AgentRunsEvents, RunEventChunk } from './agentRuns.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Logger } from '@/core/logger/index.js'

/** The Redis stream behind a run's event endpoint: `org:{orgId}:agent-run:{runId}:events`. */
export const runEventsKey = (orgId: string, runId: string): string =>
  orgKey(orgId, 'agent-run', runId, 'events')

/** The field every stream entry carries: the chunk as JSON. */
export const RUN_EVENT_FIELD = 'chunk'

/**
 * The executor's side of the run event stream (backend/agent-runs.md, §8). The stream is a live
 * view, never the run: a Redis failure is logged and the run goes on, because the steps in
 * Postgres can rebuild every event but the text deltas.
 */
export class RedisRunEvents implements AgentRunsEvents {
  constructor(
    private readonly cache: Pick<Cache, 'client'>,
    private readonly logger: Logger,
  ) {}

  async publish(orgId: string, runId: string, chunk: RunEventChunk): Promise<void> {
    const key = runEventsKey(orgId, runId)
    try {
      await this.cache.client.xadd(
        key,
        'MAXLEN',
        '~',
        AGENT_RUN_EVENT_MAX_LENGTH,
        '*',
        RUN_EVENT_FIELD,
        JSON.stringify(chunk),
      )
      await this.cache.client.expire(key, AGENT_RUN_EVENT_TTL_SECONDS)
    } catch (error) {
      this.logger.warn(
        { err: error, orgId, runId, chunk: chunk.type },
        'agent run event not published',
      )
    }
  }
}

/** Events nobody listens to: tests, and a worker without Redis streams. */
export const NO_EVENTS: AgentRunsEvents = { publish: () => Promise.resolve() }
