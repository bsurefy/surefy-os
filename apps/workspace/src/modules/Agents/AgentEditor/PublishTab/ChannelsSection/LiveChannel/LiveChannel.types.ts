// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentChannelDto } from '@surefy/contracts'

import type { ChannelCardContext } from '../ChannelsSection.types'
import type { ReactNode } from 'react'

export interface LiveChannelProps {
  channel: AgentChannelDto
  /** The channel's name in a sentence: "Slack", "the website widget". */
  name: string
  context: ChannelCardContext
  /** Opens the channel's settings; only offered to Admins and Owners. */
  onEdit?: () => void
  onWidgetTokenChange: (token: string | null) => void
  /** What the channel is set up with, shown above the actions. */
  children?: ReactNode
}
