// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AcceptInvitationResultDto,
  InvitationPreviewDto,
  SessionDto,
  SignInOptionsDto,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/**
 * The signed-in person's own sessions ("Signed-in devices"), the public sign-in options and the
 * invitation link routes. `GET /api/v1/me` and its update live in `@surefy/web-core/api/me`,
 * shared by every app; sign-in, sign-up and passwords go through the Better Auth client.
 */
export const authApi = {
  sessions: (http: HttpClient, signal?: AbortSignal) =>
    http.get<SessionDto[]>('/me/sessions', { signal }),
  revokeSession: (http: HttpClient, sessionId: string) => http.delete(`/me/sessions/${sessionId}`),
  revokeOtherSessions: (http: HttpClient) => http.post<unknown>('/me/sessions/revoke-others'),
  /** What the sign-in and sign-up screens offer on this install (public). */
  options: (http: HttpClient, signal?: AbortSignal) =>
    http.get<SignInOptionsDto>('/auth/options', { signal }),
  /** What the accept screen shows before the person signs in or up (public, by link token). */
  invitation: (http: HttpClient, token: string, signal?: AbortSignal) =>
    http.get<InvitationPreviewDto>(`/invitations/${token}`, { signal }),
  /** Signed in, verified email matching the invitation. */
  acceptInvitation: (http: HttpClient, token: string) =>
    http.post<AcceptInvitationResultDto>(`/invitations/${token}/accept`),
  /** "Ask for a new invite": notifies the inviter (public, 204). */
  requestInvitationReissue: (http: HttpClient, token: string) =>
    http.post<unknown>(`/invitations/${token}/request-reissue`),
}
