// SPDX-License-Identifier: AGPL-3.0-only
import { sseResponse } from './agentRuns.eventStream.js'

import type { RunEventStream } from './agentRuns.eventStream.js'
import type { AgentRunsQueries } from './agentRuns.queries.js'
import type { AgentRunsContext, RunRow } from './agentRuns.types.js'

/** The event stream of a run as an HTTP response, for every route that answers with it. */
export class RunStreamer {
  constructor(
    private readonly stream: RunEventStream,
    private readonly queries: Pick<AgentRunsQueries, 'current' | 'stepsOf'>,
  ) {}

  /** `after` is the Redis stream id of the last event the client saw (`Last-Event-ID`). */
  response(ctx: AgentRunsContext, run: RunRow, after?: string): Response {
    return sseResponse(
      this.stream.open({
        orgId: ctx.orgId,
        run,
        after,
        source: {
          current: (runId) => this.queries.current(ctx, runId),
          steps: (row) => this.queries.stepsOf(ctx, row),
        },
      }),
    )
  }
}

/** The client's position: `?after=` wins over the `Last-Event-ID` header. */
export const resumePoint = (
  after: string | undefined,
  header: string | string[] | undefined,
): string | undefined => after ?? (typeof header === 'string' ? header : undefined)
