// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { orgKey } from '@/core/cache/keys.js'
import {
  AgentRunAgentNotPublishedError,
  AgentRunAgentPausedError,
  AgentRunNotFoundError,
} from '@/modules/agentRuns/index.js'
import { WIDGET_MESSAGE_MAX_LENGTH, WIDGET_TOKEN_PATTERN } from '@surefy/contracts'
import type { SendWidgetMessageInput, WidgetConfigDto } from '@surefy/contracts'

import {
  CHANNEL_ACTIVITY_INTERVAL_SECONDS,
  WIDGET_CHANNEL_MESSAGES_PER_MINUTE,
  WIDGET_RUN_BINDING_TTL_SECONDS,
  WIDGET_VISITOR_MESSAGES_PER_MINUTE,
} from './agentPublishing.constants.js'
import { WidgetOriginNotAllowedError, WidgetTokenInvalidError } from './agentPublishing.errors.js'
import { hashWidgetToken } from './agentPublishing.tokens.js'
import { widgetStream } from './agentPublishing.widgetStream.js'

import type { RateWindows } from './agentPublishing.limits.js'
import type { AgentChannelsRepository, ChannelRow } from './agentPublishing.repository.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type {
  AgentRunsAgents,
  AgentRunsContext,
  AgentRunsQueries,
  AgentRunsService,
  RunnableAgent,
  RunRow,
  RunStreamer,
} from '@/modules/agentRuns/index.js'
import type { EffectiveAccess } from '@/types/context.js'

export interface WidgetChannelDeps {
  db: Database
  cache: Pick<Cache, 'client'>
  logger: Logger
  repository: AgentChannelsRepository
  agents: Pick<AgentRunsAgents, 'findById' | 'findVersion'>
  organizations: {
    getInTx(tx: DbExecutor, orgId: string): Promise<{ defaultLocale: string } | undefined>
  }
  access: { forOrganization(orgId: string): Promise<EffectiveAccess | null> }
  runs: Pick<AgentRunsService, 'start'>
  queries: Pick<AgentRunsQueries, 'access'>
  streamer: RunStreamer
  limits: RateWindows
  now?: () => Date
}

/** Who calls: the widget's token and the page's origin, and the visitor's request. */
export interface WidgetCaller {
  token: string | undefined
  origin: string | undefined
  ip: string
  requestId: string
  userAgent: string | undefined
}

/** A widget channel that may answer on the caller's page. */
interface WidgetSession {
  orgId: string
  channel: ChannelRow
  agent: RunnableAgent
}

/** An allowed origin as the browser sends it: scheme, host and port, no path or trailing slash. */
const originOf = (value: string): string | null => {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/** A visitor's address is never stored: the rate limit counts a short hash of it. */
const visitorKey = (ip: string): string =>
  createHash('sha256').update(ip, 'utf8').digest('hex').slice(0, 16)

/**
 * The public widget endpoint (contracts `agents/widget.ts`; database/agents-and-runs.md, §4): the
 * channel token names the channel, the page's origin must be one of its allowed origins, and the
 * channel and the agent must both be active. Visitors are anonymous; their runs count against the
 * organization's limits and are started like any channel's, never executed here.
 */
export class WidgetChannel {
  private readonly now: () => Date

  constructor(private readonly deps: WidgetChannelDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  /** What the launcher and the empty panel show. */
  async config(caller: WidgetCaller): Promise<WidgetConfigDto> {
    const { orgId, channel, agent } = await this.session(caller)
    return this.deps.db.tenant(orgId, async (tx) => {
      const version =
        agent.liveVersionId === null
          ? undefined
          : await this.deps.agents.findVersion(tx, orgId, agent.id, agent.liveVersionId)
      const organization = await this.deps.organizations.getInTx(tx, orgId)
      const widget = channel.config.widget
      return {
        agentName: agent.name,
        greeting: widget?.greeting ?? '',
        conversationStarters: [...(version?.definition.conversationStarters ?? [])],
        theme: widget?.theme ?? 'auto',
        position: widget?.position ?? 'bottom_right',
        locale: organization?.defaultLocale ?? 'en',
        messageMaxLength: WIDGET_MESSAGE_MAX_LENGTH,
      }
    })
  }

  /** Starts a run with the conversation so far and answers with its widget stream. */
  async send(caller: WidgetCaller, input: SendWidgetMessageInput): Promise<Response> {
    const session = await this.session(caller)
    const { orgId, channel } = session
    await this.deps.limits.hit(orgId, {
      scope: ['agent-channel', channel.id],
      perMinute: WIDGET_CHANNEL_MESSAGES_PER_MINUTE,
      message: 'This chat gets too many messages right now',
    })
    await this.deps.limits.hit(orgId, {
      scope: ['agent-channel', channel.id, 'visitor', visitorKey(caller.ip)],
      perMinute: WIDGET_VISITOR_MESSAGES_PER_MINUTE,
      message: 'Too many messages',
    })
    const ctx = await this.contextOf(session, caller)
    const run = await this.deps.runs.start(ctx, {
      agentId: session.agent.id,
      trigger: 'widget',
      channelId: channel.id,
      input: { messages: input.messages.map(({ role, text }) => ({ role, text })) },
    })
    await this.bind(orgId, run.id, input.conversationId)
    await this.touch(orgId, channel.id)
    return this.respond(ctx, run)
  }

  /** The stream of a run this conversation started, from the last event the widget received. */
  async reattach(
    caller: WidgetCaller,
    runId: string,
    conversationId: string,
    lastEventId: string | undefined,
  ): Promise<Response> {
    const session = await this.session(caller)
    const ctx = await this.contextOf(session, caller)
    // the channel's runs only; another conversation's run is not found either
    const run = await this.deps.queries.access(ctx, runId)
    if ((await this.boundTo(session.orgId, run.id)) !== conversationId) {
      throw new AgentRunNotFoundError()
    }
    return this.respond(ctx, run, lastEventId)
  }

  // ── The caller ────────────────────────────────────────────────────────────────────────────────

  /**
   * The token, then the origin, then the statuses: a site owner with a wrong embed code learns
   * that before anything about the agent.
   */
  private async session(caller: WidgetCaller): Promise<WidgetSession> {
    const { token, origin } = caller
    if (token === undefined || !WIDGET_TOKEN_PATTERN.test(token)) {
      throw new WidgetTokenInvalidError()
    }
    const resolved = await this.deps.repository.resolveToken(
      this.deps.db.global,
      hashWidgetToken(token),
    )
    if (resolved === undefined) throw new WidgetTokenInvalidError()
    const { orgId, agentId, channelId } = resolved
    return this.deps.db.tenant(orgId, async (tx) => {
      const channel = await this.deps.repository.findById(tx, orgId, agentId, channelId)
      const agent = await this.deps.agents.findById(tx, orgId, agentId)
      if (channel === undefined || agent?.deletedAt !== null) {
        throw new WidgetTokenInvalidError()
      }
      const allowed = (channel.config.widget?.allowedOrigins ?? []).map(originOf)
      const from = origin === undefined ? null : originOf(origin)
      if (from === null || !allowed.includes(from)) throw new WidgetOriginNotAllowedError()
      if (channel.status === 'paused' || channel.status === 'error') {
        throw new AgentRunAgentPausedError()
      }
      if (channel.status !== 'active') throw new AgentRunAgentNotPublishedError()
      if (agent.status === 'paused') throw new AgentRunAgentPausedError()
      if (agent.status !== 'active' || agent.liveVersionId === null) {
        throw new AgentRunAgentNotPublishedError()
      }
      return { orgId, channel, agent }
    })
  }

  /** An anonymous visitor of the channel, with the organization's limits. */
  private async contextOf(session: WidgetSession, caller: WidgetCaller): Promise<AgentRunsContext> {
    const access = await this.deps.access.forOrganization(session.orgId)
    if (access === null) throw new WidgetTokenInvalidError()
    return {
      orgId: session.orgId,
      userId: null,
      channel: { id: session.channel.id },
      requestId: caller.requestId,
      ip: caller.ip,
      ...(caller.userAgent === undefined ? {} : { userAgent: caller.userAgent }),
      role: null,
      teamIds: [],
      access,
    }
  }

  // ── Runs and streams ──────────────────────────────────────────────────────────────────────────

  private respond(ctx: AgentRunsContext, run: RunRow, after?: string): Response {
    const events = this.deps.streamer.response(ctx, run, after).body
    if (events === null) throw new Error('run stream has no body')
    return new Response(widgetStream(run.id, events), {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      },
    })
  }

  private bindingKey = (orgId: string, runId: string) => orgKey(orgId, 'widget-run', runId)

  /** Ties the run to the conversation that started it; reattaching needs the same id. */
  private async bind(orgId: string, runId: string, conversationId: string): Promise<void> {
    try {
      await this.deps.cache.client.set(
        this.bindingKey(orgId, runId),
        conversationId,
        'EX',
        WIDGET_RUN_BINDING_TTL_SECONDS,
      )
    } catch (error) {
      // Redis down: the answer still streams; only reattaching to it later fails
      this.deps.logger.warn({ err: error, runId }, 'widget run binding not stored')
    }
  }

  private async boundTo(orgId: string, runId: string): Promise<string | null> {
    try {
      return await this.deps.cache.client.get(this.bindingKey(orgId, runId))
    } catch {
      return null
    }
  }

  /** `last_active_at`, written at most once a minute per channel (database/agents-and-runs.md, §4). */
  private async touch(orgId: string, channelId: string): Promise<void> {
    try {
      const first = await this.deps.cache.client.set(
        orgKey(orgId, 'agent-channel', channelId, 'active'),
        '1',
        'EX',
        CHANNEL_ACTIVITY_INTERVAL_SECONDS,
        'NX',
      )
      if (first !== 'OK') return
      const at = this.now()
      await this.deps.db.tenant(orgId, (tx) => this.deps.repository.touch(tx, orgId, channelId, at))
    } catch (error) {
      this.deps.logger.warn({ err: error, channelId }, 'channel activity not written')
    }
  }
}
