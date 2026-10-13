// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentChannelDto, AgentChannelRequest, ExternalChannelType } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

import type { AgentTabProps } from '../../AgentEditor.types'

/** External channels chosen on the tab, sent with the next publish; one per type at most. */
export type ChannelRequests = readonly AgentChannelRequest[]

export interface ChannelsSectionProps extends Pick<AgentTabProps, 'agent' | 'definition'> {
  /** Whether the person may change what is published. */
  canChange: boolean
  /** The channels that go live (or are requested) with the next publish. */
  requests: ChannelRequests
  /** Adds, replaces or (with null) drops a channel from the next publish. */
  onRequestChange: (type: ExternalChannelType, request: AgentChannelRequest | null) => void
  /** A widget token to show once, from a publish or a new token; null when none is shown. */
  widgetToken: string | null
  onWidgetTokenChange: (token: string | null) => void
}

export type ChannelStatus = AgentChannelDto['status']

/** Slack and WhatsApp: routed by a connection and set up with a webhook at the provider. */
export type MessagingChannelType = Extract<ExternalChannelType, 'slack' | 'whatsapp'>

/** What every external channel card needs from the section. */
export interface ChannelCardContext {
  agentId: string
  /** The person may set channels up for the next publish (a request for Builders). */
  canChange: boolean
  /** Admins and Owners change live channels; Builders request. */
  canManage: boolean
  /** The agent's knowledge and tools, listed: what anyone on the channel can reach. */
  exposure: string | null
  /** Why no channel answers now: the agent is not live, paused or archived. */
  unavailable: 'notPublished' | 'paused' | 'archived' | null
  /** The pill of a channel: its status, "With the next publish" when chosen, or "Off". */
  statusOf: (channel: AgentChannelDto | null, isRequested: boolean) => ChannelStatusPill
}

export interface ChannelStatusPill {
  label: string
  tone: StatusTone
}
