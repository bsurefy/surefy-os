// SPDX-License-Identifier: AGPL-3.0-only
import type {
  OrganizationDto,
  SlugAvailabilityDto,
  UpdateOrganizationInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/** The organization's own settings (Settings › General). */
export const organizationsApi = {
  get: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<OrganizationDto>(`/orgs/${orgId}`, { signal }),
  update: (http: HttpClient, orgId: string, input: UpdateOrganizationInput) =>
    http.patch<OrganizationDto>(`/orgs/${orgId}`, input),
  slugAvailability: (http: HttpClient, slug: string, signal?: AbortSignal) =>
    http.get<SlugAvailabilityDto>('/organizations/slug-availability', {
      params: { slug },
      signal,
    }),
}
