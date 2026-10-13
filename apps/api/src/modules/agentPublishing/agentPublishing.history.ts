// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { orgKey } from '@/core/cache/keys.js'
import { CHANNEL_HISTORY_DAYS, CHANNEL_HISTORY_MESSAGES_MAX } from '@surefy/contracts'
import type { AgentRunMessage } from '@surefy/contracts'

import { CHANNEL_HISTORY_MESSAGE_MAX_LENGTH } from './agentPublishing.constants.js'

import type { Cache } from '@/core/cache/index.js'
import type { Logger } from '@/core/logger/index.js'

const TTL_SECONDS = CHANNEL_HISTORY_DAYS * 24 * 60 * 60

const messagesOf = (raw: string): AgentRunMessage[] => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is AgentRunMessage =>
        typeof entry === 'object' &&
        entry !== null &&
        ((entry as AgentRunMessage).role === 'user' ||
          (entry as AgentRunMessage).role === 'assistant') &&
        typeof (entry as AgentRunMessage).text === 'string',
    )
  } catch {
    return []
  }
}

/**
 * The recent messages of a Slack thread or a WhatsApp chat, so a run can follow up on earlier
 * questions: the last CHANNEL_HISTORY_MESSAGES_MAX messages in Redis, kept CHANNEL_HISTORY_DAYS
 * after the last one. The server keeps no other copy; the runs keep their own input. Redis down:
 * a run sees only the new message.
 */
export class ChannelHistory {
  constructor(private readonly deps: { cache: Pick<Cache, 'client'>; logger: Logger }) {}

  async read(orgId: string, channelId: string, conversation: string): Promise<AgentRunMessage[]> {
    try {
      const raw = await this.deps.cache.client.get(this.key(orgId, channelId, conversation))
      return raw === null ? [] : messagesOf(raw)
    } catch (error) {
      this.deps.logger.warn({ err: error, channelId }, 'channel history not read')
      return []
    }
  }

  /** Adds a message; the oldest ones drop out. Two messages at the same moment may lose one. */
  async append(
    orgId: string,
    channelId: string,
    conversation: string,
    message: AgentRunMessage,
  ): Promise<void> {
    const key = this.key(orgId, channelId, conversation)
    try {
      const raw = await this.deps.cache.client.get(key)
      const messages = [
        ...(raw === null ? [] : messagesOf(raw)),
        { role: message.role, text: message.text.slice(0, CHANNEL_HISTORY_MESSAGE_MAX_LENGTH) },
      ].slice(-CHANNEL_HISTORY_MESSAGES_MAX)
      await this.deps.cache.client.set(key, JSON.stringify(messages), 'EX', TTL_SECONDS)
    } catch (error) {
      this.deps.logger.warn({ err: error, channelId }, 'channel history not written')
    }
  }

  /** The conversation (a thread, a phone number) is hashed: no address or id sits in the key. */
  private key(orgId: string, channelId: string, conversation: string): string {
    const hashed = createHash('sha256').update(conversation, 'utf8').digest('hex').slice(0, 32)
    return orgKey(orgId, 'channel-history', channelId, hashed)
  }
}
