// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const USAGE_PERMISSIONS = definePermissions({
  INSIGHTS_READ: { key: 'insights:read', module: 'insights', minimumRole: 'admin' },
  /** Insights for the agents and flows the person can edit; other numbers come back restricted. */
  INSIGHTS_READ_OWN: { key: 'insights:read-own', module: 'insights', minimumRole: 'builder' },
  /** Settings › Usage & budgets read-only ("View only · Only Admins can change this"). */
  BUDGETS_READ: { key: 'budgets:read', module: null, minimumRole: 'builder' },
  /** Create, change and delete the organization, team and personal budgets. */
  BUDGETS_MANAGE: { key: 'budgets:manage', module: null, minimumRole: 'admin' },
})
