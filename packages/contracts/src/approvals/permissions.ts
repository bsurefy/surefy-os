// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const APPROVALS_PERMISSIONS = definePermissions({
  /**
   * The queue and "Decided today": items the person can see. Whether they may decide one depends
   * on the assignees as well (`canDecide`), so every role holds it.
   */
  APPROVALS_READ: { key: 'approvals:read', module: 'guard', minimumRole: 'user' },
  /** Decide an approval the person is assigned to (themselves, one of their teams, or their role). */
  APPROVALS_DECIDE: { key: 'approvals:decide', module: 'guard', minimumRole: 'user' },
})
