// SPDX-License-Identifier: AGPL-3.0-only
export interface OrgSwitcherProps {
  orgSlug: string
  /** "Create organization" on an install that holds one organization: opens the upgrade card. */
  onUpgrade: () => void
}

/** What "Create organization" offers: the action, the upgrade card, or nothing. */
export type CreateOrganizationMode = 'create' | 'upgrade' | 'hidden'
