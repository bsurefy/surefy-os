// SPDX-License-Identifier: AGPL-3.0-only
import type {
  BulkMemberActionInput,
  BulkMemberActionResultDto,
  CreateInvitationInput,
  InvitationDto,
  InvitationLinkDto,
  MemberDto,
  RemoveMemberQuery,
  UpdateMemberInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { InvitationListFilters, MemberListFilters } from './members.queries'

/** Members and invitations of one organization (Settings › Members). */
export const membersApi = {
  list: (http: HttpClient, orgId: string, query: MemberListFilters, signal?: AbortSignal) =>
    http.getPage<MemberDto>(`/orgs/${orgId}/members`, { params: { ...query }, signal }),
  update: (http: HttpClient, orgId: string, memberId: string, input: UpdateMemberInput) =>
    http.patch<MemberDto>(`/orgs/${orgId}/members/${memberId}`, input),
  remove: (http: HttpClient, orgId: string, memberId: string, query: RemoveMemberQuery) =>
    http.delete(`/orgs/${orgId}/members/${memberId}`, { params: query }),
  deactivate: (http: HttpClient, orgId: string, memberId: string) =>
    http.post<MemberDto>(`/orgs/${orgId}/members/${memberId}/deactivate`),
  reactivate: (http: HttpClient, orgId: string, memberId: string) =>
    http.post<MemberDto>(`/orgs/${orgId}/members/${memberId}/reactivate`),
  bulk: (http: HttpClient, orgId: string, input: BulkMemberActionInput) =>
    http.post<BulkMemberActionResultDto>(`/orgs/${orgId}/members/bulk`, input),
}

export const invitationsApi = {
  list: (http: HttpClient, orgId: string, query: InvitationListFilters, signal?: AbortSignal) =>
    http.getPage<InvitationDto>(`/orgs/${orgId}/invitations`, { params: { ...query }, signal }),
  /** One address per request; the key makes a retry after a lost answer safe. */
  create: (http: HttpClient, orgId: string, input: CreateInvitationInput, idempotencyKey: string) =>
    http.post<InvitationDto>(`/orgs/${orgId}/invitations`, input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  resend: (http: HttpClient, orgId: string, invitationId: string) =>
    http.post<InvitationDto>(`/orgs/${orgId}/invitations/${invitationId}/resend`),
  link: (http: HttpClient, orgId: string, invitationId: string) =>
    http.post<InvitationLinkDto>(`/orgs/${orgId}/invitations/${invitationId}/link`),
  revoke: (http: HttpClient, orgId: string, invitationId: string) =>
    http.post<InvitationDto>(`/orgs/${orgId}/invitations/${invitationId}/revoke`),
}
