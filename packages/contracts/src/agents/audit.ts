// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the agents module writes to the audit log (`<area>.<verb>`; target types `agent` and
 * `agent_channel`). Instructions, tool inputs and tokens never go into the metadata.
 */
export const AGENT_AUDIT_ACTIONS = {
  AGENT_CREATED: 'agent.created',
  /** Name or description changed (the draft definition is covered by `agent.published`). */
  AGENT_UPDATED: 'agent.updated',
  /** Metadata: version, notes length, channels. */
  AGENT_PUBLISHED: 'agent.published',
  AGENT_ROLLED_BACK: 'agent.rolled_back',
  AGENT_PAUSED: 'agent.paused',
  AGENT_RESUMED: 'agent.resumed',
  AGENT_ARCHIVED: 'agent.archived',
  AGENT_RESTORED: 'agent.restored',
  /** Metadata: the reason and whether the agent became a tombstone. */
  AGENT_DELETED: 'agent.deleted',
  AGENT_ACCESS_CHANGED: 'agent.access_changed',
  AGENT_CHANNEL_CREATED: 'agent_channel.created',
  AGENT_CHANNEL_UPDATED: 'agent_channel.updated',
  AGENT_CHANNEL_PAUSED: 'agent_channel.paused',
  AGENT_CHANNEL_RESUMED: 'agent_channel.resumed',
  AGENT_CHANNEL_DISCONNECTED: 'agent_channel.disconnected',
  AGENT_CHANNEL_TOKEN_ROTATED: 'agent_channel.token_rotated',
} as const
export type AgentAuditAction = (typeof AGENT_AUDIT_ACTIONS)[keyof typeof AGENT_AUDIT_ACTIONS]
