// SPDX-License-Identifier: AGPL-3.0-only
import {
  accessMemberParamsSchema,
  accessPolicyDtoSchema,
  effectiveAccessDtoSchema,
  memberEffectiveAccessDtoSchema,
  okResponse,
  orgParamsSchema,
  teamEffectiveAccessDtoSchema,
  teamParamsSchema,
  updateAccessPolicyInputSchema,
} from '@surefy/contracts'

const TAGS = ['access']

export const getMyAccessRoute = {
  tags: TAGS,
  summary: 'Your effective access in the organization',
  params: orgParamsSchema,
  response: { 200: okResponse(effectiveAccessDtoSchema) },
}

export const getMemberAccessRoute = {
  tags: TAGS,
  summary: "A member's effective access, with the reason for everything that is off",
  params: accessMemberParamsSchema,
  response: { 200: okResponse(memberEffectiveAccessDtoSchema) },
}

export const getTeamAccessRoute = {
  tags: TAGS,
  summary: 'The effective access of a team, before any role filter',
  params: teamParamsSchema,
  response: { 200: okResponse(teamEffectiveAccessDtoSchema) },
}

export const getOrganizationPolicyRoute = {
  tags: TAGS,
  summary: "The organization's own restrictions",
  params: orgParamsSchema,
  response: { 200: okResponse(accessPolicyDtoSchema) },
}

export const updateOrganizationPolicyRoute = {
  tags: TAGS,
  summary: "Replace the organization's own restrictions",
  params: orgParamsSchema,
  body: updateAccessPolicyInputSchema,
  response: { 200: okResponse(accessPolicyDtoSchema) },
}

export const getTeamPolicyRoute = {
  tags: TAGS,
  summary: "A team's own restrictions",
  params: teamParamsSchema,
  response: { 200: okResponse(accessPolicyDtoSchema) },
}

export const updateTeamPolicyRoute = {
  tags: TAGS,
  summary: "Replace a team's own restrictions",
  params: teamParamsSchema,
  body: updateAccessPolicyInputSchema,
  response: { 200: okResponse(accessPolicyDtoSchema) },
}
