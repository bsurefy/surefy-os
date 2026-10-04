// SPDX-License-Identifier: AGPL-3.0-only
import type { SessionDto } from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/**
 * The signed-in person's own sessions ("Signed-in devices"). `GET /api/v1/me` and its update live
 * in `@surefy/web-core/api/me`, shared by every app.
 */
export const authApi = {
  sessions: (http: HttpClient, signal?: AbortSignal) =>
    http.get<SessionDto[]>('/me/sessions', { signal }),
  revokeSession: (http: HttpClient, sessionId: string) => http.delete(`/me/sessions/${sessionId}`),
  revokeOtherSessions: (http: HttpClient) => http.post<unknown>('/me/sessions/revoke-others'),
}
