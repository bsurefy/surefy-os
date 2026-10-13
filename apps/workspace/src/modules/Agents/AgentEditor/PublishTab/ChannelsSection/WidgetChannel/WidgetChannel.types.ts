// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentChannelDto, AgentChannelRequest, WidgetChannelConfig } from '@surefy/contracts'

import type { ChannelCardContext } from '../ChannelsSection.types'

export interface WidgetChannelProps {
  /** The widget channel when it exists (live, waiting, paused or in error). */
  channel: AgentChannelDto | null
  /** The widget chosen for the next publish. */
  request: Extract<AgentChannelRequest, { type: 'widget' }> | undefined
  context: ChannelCardContext
  /** Where the widget script is served: the API's address. */
  apiBaseUrl: string
  onRequestChange: (request: AgentChannelRequest | null) => void
  widgetToken: string | null
  onWidgetTokenChange: (token: string | null) => void
}

export interface WidgetDialogProps {
  /** The settings the form starts from; none for a new widget. */
  config: WidgetChannelConfig | undefined
  /** "Anyone using the website widget can get answers from …". */
  exposure: string | null
  /** Saves the settings: chosen for the next publish, or changed on the live channel. */
  onSave: (config: WidgetChannelConfig) => Promise<void> | void
  onClose: () => void
}
