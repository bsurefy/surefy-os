// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { orgKey } from '@/core/cache/keys.js'
import { AppError } from '@/core/errors/index.js'
import type { AgentChannelConfig, AgentRunMessage } from '@surefy/contracts'

import {
  CHANNEL_EVENT_DEDUPE_SECONDS,
  CHANNEL_HISTORY_MESSAGE_MAX_LENGTH,
  EXTERNAL_CHANNEL_MESSAGES_PER_MINUTE,
  EXTERNAL_CONVERSATION_MESSAGES_PER_MINUTE,
} from './agentPublishing.constants.js'
import { ChannelRateLimitedError } from './agentPublishing.errors.js'

import type { ChannelHistory } from './agentPublishing.history.js'
import type { RateWindows } from './agentPublishing.limits.js'
import type {
  AgentChannelsRepository,
  ChannelRow,
  ResolvedChannel,
} from './agentPublishing.repository.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AgentRunsContext, AgentRunsService } from '@/modules/agentRuns/index.js'
import type { EffectiveAccess } from '@/types/context.js'

export type ExternalChannelType = 'slack' | 'whatsapp'

/** One message that arrived on a Slack or WhatsApp channel. */
export interface InboundMessage {
  /** The provider's id of the event or message: a retry repeats it. */
  eventId: string
  /** The Slack thread or WhatsApp chat: the history and the rate limit follow it. */
  conversation: string
  text: string
  /** Where the answer goes, kept on the run (`externalRef`): `slack:…` or `whatsapp:…`. */
  replyTo: string
  /** Whether the channel's settings let it answer this message (Slack's channel list, mentions). */
  accepts: (config: AgentChannelConfig) => boolean
}

export type IntakeOutcome =
  | { kind: 'started'; runId: string; firstInConversation: boolean; channel: ChannelRow }
  | { kind: 'ignored'; reason: string }

export interface ChannelIntakeDeps {
  db: Database
  cache: Pick<Cache, 'client'>
  logger: Logger
  repository: AgentChannelsRepository
  access: { forOrganization(orgId: string): Promise<EffectiveAccess | null> }
  runs: Pick<AgentRunsService, 'start'>
  limits: RateWindows
  history: ChannelHistory
  now?: () => Date
}

/** A thread or a phone number is hashed before it goes into a Redis key. */
const conversationKey = (conversation: string): string =>
  createHash('sha256').update(conversation, 'utf8').digest('hex').slice(0, 16)

/** An anonymous caller of the channel, with the organization's limits. */
export const channelContext = (
  orgId: string,
  channelId: string,
  access: EffectiveAccess,
): AgentRunsContext => ({
  orgId,
  userId: null,
  channel: { id: channelId },
  role: null,
  teamIds: [],
  access,
})

/**
 * What Slack and WhatsApp events have in common once their signature is checked: the channel and
 * the agent must be active, a repeated event is dropped, the channel and the conversation have
 * rate limits, and the run starts with the conversation's recent messages. Nothing here answers
 * the provider: an event that is not taken is ignored, and the provider still gets its `200`.
 */
export class ChannelIntake {
  constructor(private readonly deps: ChannelIntakeDeps) {}

  /** The channel an inbound account names, from any organization (definer function). */
  resolve(type: ExternalChannelType, account: string): Promise<ResolvedChannel | undefined> {
    return this.deps.repository.resolveExternal(this.deps.db.global, type, account)
  }

  /** The channel row, for the connection and settings of a resolved account. */
  channelOf(resolved: ResolvedChannel): Promise<ChannelRow | undefined> {
    return this.deps.db.tenant(resolved.orgId, (tx) =>
      this.deps.repository.findInOrg(tx, resolved.orgId, resolved.channelId),
    )
  }

  async receive(
    type: ExternalChannelType,
    resolved: ResolvedChannel,
    channel: ChannelRow,
    message: InboundMessage,
  ): Promise<IntakeOutcome> {
    const { orgId } = resolved
    if (channel.status !== 'active' || resolved.agentStatus !== 'active') {
      return { kind: 'ignored', reason: 'not_active' }
    }
    if (message.text.trim() === '' || !message.accepts(channel.config)) {
      return { kind: 'ignored', reason: 'not_for_this_channel' }
    }
    if (!(await this.firstDelivery(orgId, channel.id, message.eventId))) {
      return { kind: 'ignored', reason: 'repeat' }
    }
    try {
      await this.deps.limits.hit(orgId, {
        scope: ['agent-channel', channel.id],
        perMinute: EXTERNAL_CHANNEL_MESSAGES_PER_MINUTE,
        message: 'This channel gets too many messages right now',
      })
      await this.deps.limits.hit(orgId, {
        scope: ['agent-channel', channel.id, 'conversation', conversationKey(message.conversation)],
        perMinute: EXTERNAL_CONVERSATION_MESSAGES_PER_MINUTE,
        message: 'Too many messages in this conversation',
      })
    } catch (error) {
      if (error instanceof ChannelRateLimitedError)
        return { kind: 'ignored', reason: 'rate_limited' }
      throw error
    }
    const access = await this.deps.access.forOrganization(orgId)
    if (access === null) return { kind: 'ignored', reason: 'organization' }

    const earlier = await this.deps.history.read(orgId, channel.id, message.conversation)
    const asked: AgentRunMessage = {
      role: 'user',
      text: message.text.slice(0, CHANNEL_HISTORY_MESSAGE_MAX_LENGTH),
    }
    let run: { id: string }
    try {
      run = await this.deps.runs.start(channelContext(orgId, channel.id, access), {
        agentId: resolved.agentId,
        trigger: type,
        channelId: channel.id,
        input: { messages: [...earlier, asked], externalRef: message.replyTo },
      })
    } catch (error) {
      // the organization's run limit, an agent paused a moment ago: nothing to answer
      if (error instanceof AppError) return { kind: 'ignored', reason: error.code }
      throw error
    }
    await this.deps.history.append(orgId, channel.id, message.conversation, asked)
    await this.touch(orgId, channel.id)
    return {
      kind: 'started',
      runId: run.id,
      firstInConversation: earlier.length === 0,
      channel,
    }
  }

  /** The provider's id seen for the first time in a day: retries and repeats are dropped. */
  private async firstDelivery(orgId: string, channelId: string, eventId: string): Promise<boolean> {
    try {
      const set = await this.deps.cache.client.set(
        orgKey(orgId, 'channel-event', channelId, eventId),
        '1',
        'EX',
        CHANNEL_EVENT_DEDUPE_SECONDS,
        'NX',
      )
      return set === 'OK'
    } catch (error) {
      // Redis down: answering twice is better than not answering
      this.deps.logger.warn({ err: error, channelId }, 'channel event not deduplicated')
      return true
    }
  }

  /** `last_active_at`, written at most once a minute per channel. */
  private async touch(orgId: string, channelId: string): Promise<void> {
    try {
      const first = await this.deps.cache.client.set(
        orgKey(orgId, 'agent-channel', channelId, 'active'),
        '1',
        'EX',
        60,
        'NX',
      )
      if (first !== 'OK') return
      const at = (this.deps.now ?? (() => new Date()))()
      await this.deps.db.tenant(orgId, (tx) => this.deps.repository.touch(tx, orgId, channelId, at))
    } catch (error) {
      this.deps.logger.warn({ err: error, channelId }, 'channel activity not written')
    }
  }
}
