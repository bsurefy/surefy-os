// SPDX-License-Identifier: AGPL-3.0-only
import type {
  CompleteSetupInput,
  MemberPreferencesDto,
  SetupChecklistDto,
  SetupInput,
  SetupResultDto,
  SetupStatusDto,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/** First-run setup (public, before any organization exists) and the home-screen checklist. */
export const setupApi = {
  status: (http: HttpClient, signal?: AbortSignal) =>
    http.get<SetupStatusDto>('/setup/status', { signal }),
  run: (http: HttpClient, input: SetupInput) => http.post<SetupResultDto>('/setup', input),
  complete: async (http: HttpClient, orgId: string, input: CompleteSetupInput) => {
    await http.post<null>(`/orgs/${orgId}/setup/complete`, input)
  },
  checklist: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<SetupChecklistDto>(`/orgs/${orgId}/setup/checklist`, { signal }),
  /** The checklist's dismissal is the member's own preference (`MemberPreferences.checklistDismissed`). */
  setChecklistDismissed: (http: HttpClient, orgId: string, checklistDismissed: boolean) =>
    http.patch<MemberPreferencesDto>(`/orgs/${orgId}/members/me/preferences`, {
      checklistDismissed,
    }),
}
