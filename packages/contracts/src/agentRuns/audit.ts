// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the agentRuns module writes to the audit log (`<area>.<verb>`, target type `agent_run`).
 * Starting a run from a channel and every action step are audited; prompts, tool arguments and
 * results never go into the metadata.
 */
export const AGENT_RUN_AUDIT_ACTIONS = {
  /** Channel starts (API, widget, Slack, WhatsApp); chat and test runs are not audited one by one. */
  AGENT_RUN_STARTED: 'agent_run.started',
  /** A tool call that changed something outside SurefyOS ran: metadata has the tool and its permission. */
  AGENT_RUN_ACTION_EXECUTED: 'agent_run.action_executed',
  AGENT_RUN_CANCELED: 'agent_run.canceled',
  /** Metadata: the original run id. */
  AGENT_RUN_RETRIED: 'agent_run.retried',
} as const
export type AgentRunAuditAction =
  (typeof AGENT_RUN_AUDIT_ACTIONS)[keyof typeof AGENT_RUN_AUDIT_ACTIONS]
