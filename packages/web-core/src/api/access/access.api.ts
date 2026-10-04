// SPDX-License-Identifier: AGPL-3.0-only
import type { EffectiveAccessDto } from '@surefy/contracts'

import type { HttpClient } from '../../http/http.types'

/** `GET /api/v1/orgs/:orgId/access/me`: what the signed-in person may do in one organization. */
export const accessApi = {
  me: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<EffectiveAccessDto>(`/orgs/${orgId}/access/me`, { signal }),
}
