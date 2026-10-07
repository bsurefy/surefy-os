// SPDX-License-Identifier: AGPL-3.0-only
import {
  bulkMemberActionInputSchema,
  bulkMemberActionResultDtoSchema,
  listMembersQuerySchema,
  memberDtoSchema,
  memberParamsSchema,
  memberPreferencesDtoSchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  removeMemberQuerySchema,
  updateMemberInputSchema,
  updateMemberPreferencesInputSchema,
} from '@surefy/contracts'

const TAGS = ['members']

export const listMembersRoute = {
  tags: TAGS,
  summary: 'List the members of the organization',
  params: orgParamsSchema,
  querystring: listMembersQuerySchema,
  response: { 200: pageResponse(memberDtoSchema) },
}

export const getMemberRoute = {
  tags: TAGS,
  summary: 'Get a member',
  params: memberParamsSchema,
  response: { 200: okResponse(memberDtoSchema) },
}

export const updateMemberRoute = {
  tags: TAGS,
  summary: "Change a member's role or primary team",
  params: memberParamsSchema,
  body: updateMemberInputSchema,
  response: { 200: okResponse(memberDtoSchema) },
}

export const removeMemberRoute = {
  tags: TAGS,
  summary: 'Remove a member from the organization',
  params: memberParamsSchema,
  querystring: removeMemberQuerySchema,
}

export const deactivateMemberRoute = {
  tags: TAGS,
  summary: 'Deactivate a member; role and teams are kept',
  params: memberParamsSchema,
  response: { 200: okResponse(memberDtoSchema) },
}

export const reactivateMemberRoute = {
  tags: TAGS,
  summary: 'Reactivate a member with the same role and teams',
  params: memberParamsSchema,
  response: { 200: okResponse(memberDtoSchema) },
}

export const bulkMemberActionRoute = {
  tags: TAGS,
  summary: 'Apply one action to several members',
  params: orgParamsSchema,
  body: bulkMemberActionInputSchema,
  response: { 200: okResponse(bulkMemberActionResultDtoSchema) },
}

export const getMemberPreferencesRoute = {
  tags: TAGS,
  summary: "The signed-in member's preferences in this organization",
  params: orgParamsSchema,
  response: { 200: okResponse(memberPreferencesDtoSchema) },
}

export const updateMemberPreferencesRoute = {
  tags: TAGS,
  summary: "Change the signed-in member's preferences in this organization",
  params: orgParamsSchema,
  body: updateMemberPreferencesInputSchema,
  response: { 200: okResponse(memberPreferencesDtoSchema) },
}
