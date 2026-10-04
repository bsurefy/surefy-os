// SPDX-License-Identifier: AGPL-3.0-only
import type { MeDto, UpdateMeInput } from '@surefy/contracts'

import type { HttpClient } from '../../http/http.types'

/** `GET/PATCH /api/v1/me`: the signed-in person as every app sees them. */
export const meApi = {
  get: (http: HttpClient, signal?: AbortSignal) => http.get<MeDto>('/me', { signal }),
  update: (http: HttpClient, input: UpdateMeInput) => http.patch<MeDto>('/me', input),
}
