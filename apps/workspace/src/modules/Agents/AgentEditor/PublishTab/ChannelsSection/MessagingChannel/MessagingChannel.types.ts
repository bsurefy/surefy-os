// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentChannelDto, AgentChannelRequest } from '@surefy/contracts'

import type { ChannelCardContext, MessagingChannelType } from '../ChannelsSection.types'

export type MessagingRequest = Extract<AgentChannelRequest, { type: MessagingChannelType }>

export interface MessagingChannelProps {
  type: MessagingChannelType
  /** The channel when it exists (live, waiting, paused or in error). */
  channel: AgentChannelDto | null
  /** The channel chosen for the next publish. */
  request: MessagingRequest | undefined
  context: ChannelCardContext
  onRequestChange: (request: AgentChannelRequest | null) => void
  onWidgetTokenChange: (token: string | null) => void
}

export interface MessagingDialogProps {
  type: MessagingChannelType
  /** What the form starts from; none for a new channel. */
  initial: MessagingRequest | undefined
  exposure: string | null
  /** Saves the channel: chosen for the next publish, or changed on the live channel. */
  onSave: (request: MessagingRequest) => Promise<void> | void
  onClose: () => void
}
