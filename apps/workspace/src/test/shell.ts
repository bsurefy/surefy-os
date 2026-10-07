// SPDX-License-Identifier: AGPL-3.0-only
import { ROLE_PERMISSIONS } from '@surefy/contracts'
import type { EffectiveAccessDto, MeDto, OrgRole } from '@surefy/contracts'
import { accessKeys } from '@surefy/web-core/api/access'
import { meKeys } from '@surefy/web-core/api/me'
import { createTestQueryClient, effectiveAccessFactory } from '@surefy/web-core/testing'

import { ACME_ORG, shellMe } from '../../mock/handlers/shell.fixtures'

export const ORG_ID = ACME_ORG.id
export const ORG_SLUG = ACME_ORG.slug

export function accessAs(
  role: OrgRole,
  overrides: Partial<EffectiveAccessDto> = {},
): EffectiveAccessDto {
  return effectiveAccessFactory({ role, permissions: [...ROLE_PERMISSIONS[role]], ...overrides })
}

/**
 * A query client seeded as the organization layout seeds it: the session and the effective
 * access, so the shell renders at once.
 */
export function seededShellClient(
  access: EffectiveAccessDto = accessAs('owner'),
  me: MeDto = shellMe(),
) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(meKeys.current(), me)
  queryClient.setQueryData(accessKeys.me(ORG_ID), access)
  return queryClient
}
