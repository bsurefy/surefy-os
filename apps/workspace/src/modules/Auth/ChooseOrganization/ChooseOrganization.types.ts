// SPDX-License-Identifier: AGPL-3.0-only
import type { MeMembershipDto } from '@surefy/contracts'

export interface ChooseOrganizationProps {
  /** The person's active memberships, read on the server. */
  memberships: MeMembershipDto[]
}
