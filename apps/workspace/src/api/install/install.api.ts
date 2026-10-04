// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AddInstallAdminInput,
  InstallAdminDto,
  InstallOrganizationDto,
  InstallSettingsDto,
  SendTestEmailInput,
  UpdateInstallSettingsInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/** Install-wide settings and administrators of a self-hosted install (Settings › Install). */
export const installApi = {
  settings: (http: HttpClient, signal?: AbortSignal) =>
    http.get<InstallSettingsDto>('/install/settings', { signal }),
  updateSettings: (http: HttpClient, input: UpdateInstallSettingsInput) =>
    http.patch<InstallSettingsDto>('/install/settings', input),
  /** Sends one message with the stored settings; answers 204. */
  sendTestEmail: (http: HttpClient, input: SendTestEmailInput) =>
    http.post<unknown>('/install/smtp/test', input),
  admins: (http: HttpClient, signal?: AbortSignal) =>
    http.getPage<InstallAdminDto>('/install/admins', { signal }),
  addAdmin: (http: HttpClient, input: AddInstallAdminInput) =>
    http.post<InstallAdminDto>('/install/admins', input),
  removeAdmin: (http: HttpClient, userId: string) => http.delete(`/install/admins/${userId}`),
  organizations: (http: HttpClient, signal?: AbortSignal) =>
    http.getPage<InstallOrganizationDto>('/install/organizations', { signal }),
}
