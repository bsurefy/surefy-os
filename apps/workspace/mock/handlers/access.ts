// SPDX-License-Identifier: AGPL-3.0-only
import {
  effectiveAccessDtoSchema,
  FEATURES,
  okResponse,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from '@surefy/contracts'
import type { EffectiveAccessDto, OrgRole } from '@surefy/contracts'
import { effectiveAccessFactory } from '@surefy/web-core/testing'
import { defineMockDomain, defineMockHandler, mockOk } from '@surefy/web-core/testing/mock'

import { shellSafe } from './shell.fixtures'

function accessAs(role: OrgRole, overrides: Partial<EffectiveAccessDto> = {}): EffectiveAccessDto {
  return effectiveAccessFactory({ role, permissions: [...ROLE_PERMISSIONS[role]], ...overrides })
}

/**
 * `GET /api/v1/orgs/:orgId/access/me`: an Owner on Community by default. Scenarios:
 * `role-user`, `role-builder`, `role-admin`, `enterprise` (every feature), `forbidden` (a User
 * without notifications, for the permission-denied page). Its other failure scenarios keep the
 * default, so the shell stays up while a page shows its state.
 */
export const accessDomain = defineMockDomain('access', [
  defineMockHandler({
    method: 'get',
    path: '/orgs/:orgId/access/me',
    response: okResponse(effectiveAccessDtoSchema),
    scenarios: {
      default: () => mockOk(accessAs('owner')),
      ...shellSafe(() => mockOk(accessAs('owner'))),
      'role-user': () => mockOk(accessAs('user')),
      'role-builder': () => mockOk(accessAs('builder')),
      'role-admin': () => mockOk(accessAs('admin')),
      enterprise: () => mockOk(accessAs('owner', { features: Object.values(FEATURES) })),
      forbidden: () =>
        mockOk(
          accessAs('user', {
            permissions: ROLE_PERMISSIONS.user.filter(
              (permission) => permission !== PERMISSIONS.NOTIFICATIONS_READ,
            ),
          }),
        ),
    },
  }),
])
