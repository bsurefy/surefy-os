// SPDX-License-Identifier: AGPL-3.0-only
import { AppError } from '@/core/errors/index.js'

import {
  ChannelSignatureInvalidError,
  ChannelVerifyTokenInvalidError,
} from './agentPublishing.errors.js'
import {
  isSlackSignatureValid,
  isWhatsappSignatureValid,
  parseBody,
  readSlackEnvelope,
  readWhatsappMessages,
  sendWhatsappMessage,
  slackAccepts,
} from './agentPublishing.providers.js'
import { isWhatsappVerifyToken } from './agentPublishing.tokens.js'

import type { ChannelIntake } from './agentPublishing.intake.js'
import type { WhatsappMessage } from './agentPublishing.providers.js'
import type { ChannelRow, ResolvedChannel } from './agentPublishing.repository.js'
import type { Logger } from '@/core/logger/index.js'
import type { ConnectionUse, OutboundHttp } from '@/modules/connections/index.js'

export interface InboundChannelsDeps {
  intake: ChannelIntake
  connections: {
    open(
      orgId: string,
      principal: { userId: string | null; teamIds: readonly string[] },
      connectionId: string,
    ): Promise<ConnectionUse>
  }
  http: OutboundHttp
  logger: Logger
  /** The Slack app's signing secret; without it no Slack event is taken. */
  slackSigningSecret?: string
  /** The key of the WhatsApp verify tokens. */
  verifyKey: string
  now?: () => Date
}

/** The secrets a channel's connection holds, opened for one delivery. */
export const openChannelConnection = (
  connections: InboundChannelsDeps['connections'],
  orgId: string,
  channel: ChannelRow,
): Promise<ConnectionUse> => {
  if (channel.connectionId === null) throw new Error('external channel without a connection')
  // the person who set the channel up; an organization connection is usable by anyone
  return connections.open(
    orgId,
    { userId: channel.requestedByUserId, teamIds: [] },
    channel.connectionId,
  )
}

/**
 * The events Slack and WhatsApp deliver (contracts `agents/channelWebhooks.ts`). The signature is
 * checked before anything is taken; then each message goes through the intake, and the answer
 * follows when the run finishes. The provider gets its answer at once.
 */
export class InboundChannels {
  constructor(private readonly deps: InboundChannelsDeps) {}

  /** A Slack Events API delivery; the set-up check answers with its challenge. */
  async slack(delivery: {
    body: Buffer
    signature: string | undefined
    timestamp: string | undefined
  }): Promise<{ challenge: string } | null> {
    const valid = isSlackSignatureValid({
      secret: this.deps.slackSigningSecret,
      body: delivery.body,
      signature: delivery.signature,
      timestamp: delivery.timestamp,
      now: (this.deps.now ?? (() => new Date()))(),
    })
    if (!valid) throw new ChannelSignatureInvalidError()
    const envelope = readSlackEnvelope(parseBody(delivery.body))
    if (envelope.kind === 'url_verification') return { challenge: envelope.challenge }
    if (envelope.kind !== 'message') return null
    const { message } = envelope
    const found = await this.channelOf('slack', message.account)
    if (found === undefined) return null
    await this.deps.intake.receive('slack', found.resolved, found.channel, {
      eventId: message.eventId,
      conversation: `${message.channel}:${message.thread}`,
      text: message.text,
      replyTo: `slack:${message.channel}:${message.thread}`,
      accepts: (config) => slackAccepts(config, message),
    })
    return null
  }

  /** Meta's webhook set-up check: the challenge back for the channel's verify token. */
  whatsappVerify(query: { mode?: string; token?: string; challenge?: string }): string {
    const { mode, token, challenge } = query
    if (
      mode !== 'subscribe' ||
      token === undefined ||
      challenge === undefined ||
      !isWhatsappVerifyToken(this.deps.verifyKey, token)
    ) {
      throw new ChannelVerifyTokenInvalidError()
    }
    return challenge
  }

  /**
   * A WhatsApp delivery: its messages grouped by business number. The app secret of the number's
   * connection checks the signature; a number no channel answers for is left alone.
   */
  async whatsapp(delivery: { body: Buffer; signature: string | undefined }): Promise<void> {
    const byAccount = new Map<string, WhatsappMessage[]>()
    for (const message of readWhatsappMessages(parseBody(delivery.body))) {
      byAccount.set(message.account, [...(byAccount.get(message.account) ?? []), message])
    }
    for (const [account, messages] of byAccount) {
      await this.whatsappAccount(account, messages, delivery)
    }
  }

  /** The messages for one business number: check the signature, then take each message. */
  private async whatsappAccount(
    account: string,
    messages: readonly WhatsappMessage[],
    delivery: { body: Buffer; signature: string | undefined },
  ): Promise<void> {
    const found = await this.channelOf('whatsapp', account)
    if (found === undefined) return
    const { resolved, channel } = found
    let connection: ConnectionUse
    try {
      connection = await openChannelConnection(this.deps.connections, resolved.orgId, channel)
    } catch (error) {
      // an expired or removed connection: nothing can be checked or answered
      if (!(error instanceof AppError)) throw error
      this.deps.logger.warn(
        { channelId: channel.id, code: error.code },
        'whatsapp channel connection unusable',
      )
      return
    }
    const valid = isWhatsappSignatureValid({
      secret: connection.secret.extra?.appSecret,
      body: delivery.body,
      signature: delivery.signature,
    })
    if (!valid) throw new ChannelSignatureInvalidError()
    const welcome = channel.config.whatsapp?.welcomeMessage.trim() ?? ''
    for (const message of messages) {
      const outcome = await this.deps.intake.receive('whatsapp', resolved, channel, {
        eventId: message.eventId,
        conversation: message.from,
        text: message.text,
        replyTo: `whatsapp:${message.from}`,
        accepts: () => true,
      })
      if (outcome.kind === 'started' && outcome.firstInConversation && welcome !== '') {
        await this.welcome(connection, account, message.from, welcome)
      }
    }
  }

  private async channelOf(
    type: 'slack' | 'whatsapp',
    account: string,
  ): Promise<{ resolved: ResolvedChannel; channel: ChannelRow } | undefined> {
    const resolved = await this.deps.intake.resolve(type, account)
    if (resolved === undefined) return undefined
    const channel = await this.deps.intake.channelOf(resolved)
    return channel === undefined ? undefined : { resolved, channel }
  }

  /** The channel's welcome message, before the first answer of a new chat; best effort. */
  private async welcome(
    connection: ConnectionUse,
    phoneNumberId: string,
    to: string,
    text: string,
  ): Promise<void> {
    try {
      await sendWhatsappMessage(this.deps.http, {
        token: connection.secret.token ?? '',
        phoneNumberId,
        to,
        text,
      })
    } catch (error) {
      this.deps.logger.warn(
        { err: error, connectionId: connection.id },
        'whatsapp welcome not sent',
      )
    }
  }
}
