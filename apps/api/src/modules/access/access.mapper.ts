// SPDX-License-Identifier: AGPL-3.0-only
import type { AccessPolicyDto } from '@surefy/contracts'

import type { AccessPolicyRow } from './access.repository.js'

/** A level's own restrictions; a level without a row reads as "no restrictions". */
export function toAccessPolicyDto(
  teamId: string | null,
  row: AccessPolicyRow | undefined,
): AccessPolicyDto {
  return {
    teamId,
    policy: row?.policy ?? { version: 1 },
    updatedByUserId: row?.updatedByUserId ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  }
}
