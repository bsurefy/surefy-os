// SPDX-License-Identifier: AGPL-3.0-only
import {
  acceptInvitationResultDtoSchema,
  createInvitationInputSchema,
  invitationDtoSchema,
  invitationLinkDtoSchema,
  invitationParamsSchema,
  invitationPreviewDtoSchema,
  invitationTokenParamsSchema,
  listInvitationsQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
} from '@surefy/contracts'

const TAGS = ['invitations']

export const listInvitationsRoute = {
  tags: TAGS,
  summary: 'List invitations; pending ones by default',
  params: orgParamsSchema,
  querystring: listInvitationsQuerySchema,
  response: { 200: pageResponse(invitationDtoSchema) },
}

export const createInvitationRoute = {
  tags: TAGS,
  summary: 'Invite an email address with a role and teams',
  params: orgParamsSchema,
  body: createInvitationInputSchema,
  response: { 201: okResponse(invitationDtoSchema) },
}

export const resendInvitationRoute = {
  tags: TAGS,
  summary: 'Send the invitation again with a new link',
  params: invitationParamsSchema,
  response: { 200: okResponse(invitationDtoSchema) },
}

export const invitationLinkRoute = {
  tags: TAGS,
  summary: 'Create a new invite link, shown once',
  params: invitationParamsSchema,
  response: { 200: okResponse(invitationLinkDtoSchema) },
}

export const revokeInvitationRoute = {
  tags: TAGS,
  summary: 'Revoke a pending invitation',
  params: invitationParamsSchema,
  response: { 200: okResponse(invitationDtoSchema) },
}

export const previewInvitationRoute = {
  tags: TAGS,
  summary: 'What an invitation link is for, before signing in',
  params: invitationTokenParamsSchema,
  response: { 200: okResponse(invitationPreviewDtoSchema) },
}

export const acceptInvitationRoute = {
  tags: TAGS,
  summary: 'Join the organization with the signed-in account',
  params: invitationTokenParamsSchema,
  response: { 200: okResponse(acceptInvitationResultDtoSchema) },
}

export const requestReissueRoute = {
  tags: TAGS,
  summary: 'Ask the inviter for a new invitation',
  params: invitationTokenParamsSchema,
}
