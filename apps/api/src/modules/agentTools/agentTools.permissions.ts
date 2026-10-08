// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentToolPermission } from '@surefy/contracts'

import type { ExecutableTool } from './agentTools.types.js'

// The permissions of a tool (Read only, Ask first, Can act). Guard turns them into approvals
// (agent-runs.md, §5); this file holds what the adapters enforce themselves, so a tool never does
// more than its permission says even if Guard were skipped or misconfigured.

/**
 * What a call runs under. A server that calls an action destructive never gets it as Read only:
 * the hint can only make the action stricter, never looser, because a server's description of
 * itself is not trusted to loosen anything.
 */
export function effectivePermission(
  declared: AgentToolPermission,
  hints: { destructiveHint: boolean | null } | null,
): AgentToolPermission {
  return declared === 'read_only' && hints?.destructiveHint === true ? 'ask_first' : declared
}

/** A Read only API tool reads: any other method is refused, whatever the address is. */
export function readOnlyViolation(
  tool: Extract<ExecutableTool, { kind: 'api' }>,
  permission: AgentToolPermission,
): string | null {
  return permission === 'read_only' && tool.method !== 'GET'
    ? `This tool is set to Read only but sends ${tool.method}. It needs the Ask first or Can act permission.`
    : null
}

/**
 * Whether a failed call may be repeated on its own: a Read only tool after a transient failure,
 * any tool when the failure came before anything was sent. A call that acts and may have arrived
 * is never repeated; a person retries it.
 */
export function mayRetry(
  permission: AgentToolPermission,
  failure: { transient: boolean; beforeSend: boolean },
): boolean {
  return failure.transient && (failure.beforeSend || permission === 'read_only')
}
