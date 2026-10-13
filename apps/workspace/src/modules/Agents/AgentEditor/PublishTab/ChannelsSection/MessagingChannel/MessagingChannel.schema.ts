// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { SLACK_RESPOND_TO } from '@surefy/contracts'
import type {
  AgentChannelRequest,
  SlackChannelConfig,
  WhatsappChannelConfig,
} from '@surefy/contracts'

import { parseSlackChannelIds } from '../ChannelsSection.utils'

import type { MessagingChannelType } from '../ChannelsSection.types'

const SLACK_CHANNELS_MAX = 100
const BUSINESS_ACCOUNT_MAX = 100
const WELCOME_MAX = 1000

/** What the form says when a value is not acceptable; translated by the caller. */
export interface MessagingFormMessages {
  connection: string
  slackChannels: string
  businessAccount: string
  welcome: string
}

/**
 * One form for Slack and WhatsApp: the connection, and the fields of the channel's own type. The
 * other type's fields stay at their defaults and are not sent.
 */
export function createMessagingFormSchema(
  type: MessagingChannelType,
  messages: MessagingFormMessages,
) {
  return z.object({
    connectionId: z
      .string()
      .nullable()
      .refine((id) => id !== null, messages.connection),
    respondTo: z.enum(SLACK_RESPOND_TO),
    channelIds: z
      .string()
      .refine(
        (text) => parseSlackChannelIds(text).length <= SLACK_CHANNELS_MAX,
        messages.slackChannels,
      ),
    businessAccountId: z
      .string()
      .trim()
      .max(BUSINESS_ACCOUNT_MAX, messages.businessAccount)
      .refine((id) => type !== 'whatsapp' || id !== '', messages.businessAccount),
    welcomeMessage: z.string().trim().max(WELCOME_MAX, messages.welcome),
  })
}

type MessagingFormSchema = ReturnType<typeof createMessagingFormSchema>
/** What the form holds: no connection until one is picked. */
export type MessagingFormInput = z.input<MessagingFormSchema>
/** What a valid form gives: the connection is set. */
export type MessagingFormValues = z.output<MessagingFormSchema>

export function messagingToValues(
  connectionId: string | null,
  slack: SlackChannelConfig | undefined,
  whatsapp: WhatsappChannelConfig | undefined,
): MessagingFormInput {
  return {
    connectionId,
    respondTo: slack?.respondTo ?? 'mentions',
    channelIds: slack?.channelIds.join('\n') ?? '',
    businessAccountId: whatsapp?.businessAccountId ?? '',
    welcomeMessage: whatsapp?.welcomeMessage ?? '',
  }
}

/** The channel to request, from valid values. */
export function toMessagingRequest(
  type: MessagingChannelType,
  values: MessagingFormValues,
): Extract<AgentChannelRequest, { type: MessagingChannelType }> {
  const { connectionId } = values
  if (type === 'slack') {
    return {
      type,
      connectionId,
      config: { respondTo: values.respondTo, channelIds: parseSlackChannelIds(values.channelIds) },
    }
  }
  return {
    type,
    connectionId,
    config: {
      businessAccountId: values.businessAccountId.trim(),
      welcomeMessage: values.welcomeMessage.trim(),
    },
  }
}
