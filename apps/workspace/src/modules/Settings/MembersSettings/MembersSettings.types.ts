// SPDX-License-Identifier: AGPL-3.0-only
import type { InvitationDto, MemberDto } from '@surefy/contracts'

/** A row of the Members table: a person, or an invitation that has not been accepted yet. */
export type MemberRow =
  | { kind: 'member'; id: string; member: MemberDto }
  | { kind: 'invitation'; id: string; invitation: InvitationDto }
