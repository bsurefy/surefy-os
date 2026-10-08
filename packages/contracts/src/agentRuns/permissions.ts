// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const AGENT_RUNS_PERMISSIONS = definePermissions({
  /** Insights › Runs, run detail and an agent's Runs tab: Builders see their agents' runs, Admins all. Resource access is checked per agent. */
  RUNS_READ: { key: 'runs:read', module: 'agents', minimumRole: 'builder' },
  /** Cancel a running or waiting run. */
  RUNS_CANCEL: { key: 'runs:cancel', module: 'agents', minimumRole: 'builder' },
  /** Start a new run from a finished one ("Re-run in test mode", "Retry step"). */
  RUNS_RETRY: { key: 'runs:retry', module: 'agents', minimumRole: 'builder' },
})
