// SPDX-License-Identifier: AGPL-3.0-only
export interface OrgSwitcherProps {
  orgSlug: string
  isCollapsed?: boolean
}

/** What "Create organization" offers: the action, the upgrade card, or nothing. */
export type CreateOrganizationMode = 'create' | 'upgrade' | 'hidden'
