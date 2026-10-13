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
  AGENT_TOOL_HTTP_ERROR: 'AGENT_TOOL_HTTP_ERROR', // status reason: the tool's address answered with an error status
  AGENT_TOOL_BAD_RESPONSE: 'AGENT_TOOL_BAD_RESPONSE', // status reason: the answer was not what the tool kind expects (an MCP server that does not speak MCP)
  AGENT_WIDGET_TOKEN_INVALID: 'AGENT_WIDGET_TOKEN_INVALID', // 401: unknown, rotated or disconnected widget token
  AGENT_WIDGET_ORIGIN_NOT_ALLOWED: 'AGENT_WIDGET_ORIGIN_NOT_ALLOWED', // 403: the page's origin is not in the widget's allowed origins
  AGENT_CHANNEL_SIGNATURE_INVALID: 'AGENT_CHANNEL_SIGNATURE_INVALID', // 401: a Slack or WhatsApp event without a valid signature
  AGENT_CHANNEL_VERIFY_TOKEN_INVALID: 'AGENT_CHANNEL_VERIFY_TOKEN_INVALID', // 403: WhatsApp's webhook set-up sent another verify token
  AGENT_CHANNEL_ACCOUNT_IN_USE: 'AGENT_CHANNEL_ACCOUNT_IN_USE', // 409: the Slack workspace or WhatsApp number already answers for another agent
} as const
