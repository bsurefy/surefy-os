// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the agents domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const AGENTS_ERROR_CODES = {
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND', // 404: also for agents the person may not see
  AGENT_EDIT_CONFLICT: 'AGENT_EDIT_CONFLICT', // 409: the draft moved since `baseRevision`; `details` has AgentEditConflictDetails
  AGENT_NOT_EDITABLE: 'AGENT_NOT_EDITABLE', // 409: archived or deleted agents are read-only
  AGENT_NOT_READY: 'AGENT_NOT_READY', // 422: a blocking readiness item fails; `details` lists the items
  AGENT_PAUSED: 'AGENT_PAUSED', // 409: a paused agent starts no new run and answers on no channel
  AGENT_STATE_INVALID: 'AGENT_STATE_INVALID', // 409: the transition does not exist from the current status
  AGENT_NOT_PUBLISHED: 'AGENT_NOT_PUBLISHED', // 409: nothing is live yet (rollback, pause, channels)
  AGENT_MODEL_NOT_ALLOWED_FOR_AUDIENCE: 'AGENT_MODEL_NOT_ALLOWED_FOR_AUDIENCE', // 422: a team or person in the audience may not use the agent's model
  AGENT_VERSION_NOT_FOUND: 'AGENT_VERSION_NOT_FOUND', // 404
  AGENT_TEMPLATE_NOT_FOUND: 'AGENT_TEMPLATE_NOT_FOUND', // 404
  AGENT_CHANNEL_NOT_FOUND: 'AGENT_CHANNEL_NOT_FOUND', // 404
  AGENT_CHANNEL_EXISTS: 'AGENT_CHANNEL_EXISTS', // 409: an agent has at most one workspace chat, API and widget channel
  AGENT_CHANNEL_PENDING_APPROVAL: 'AGENT_CHANNEL_PENDING_APPROVAL', // 409: the channel waits for an Admin and cannot change yet
} as const
