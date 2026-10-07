// SPDX-License-Identifier: AGPL-3.0-only
import {
  addTeamMembersInputSchema,
  addTeamMembersResultDtoSchema,
  createTeamInputSchema,
  deleteTeamQuerySchema,
  listTeamMembersQuerySchema,
  listTeamsQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  teamDeletionImpactDtoSchema,
  teamDtoSchema,
  teamMemberDtoSchema,
  teamMemberParamsSchema,
  teamParamsSchema,
  updateTeamInputSchema,
} from '@surefy/contracts'

const TAGS = ['teams']

export const listTeamsRoute = {
  tags: TAGS,
  summary: 'List the teams of the organization',
  params: orgParamsSchema,
  querystring: listTeamsQuerySchema,
  response: { 200: pageResponse(teamDtoSchema) },
}

export const createTeamRoute = {
  tags: TAGS,
  summary: 'Create a team, optionally with its first members and lead',
  params: orgParamsSchema,
  body: createTeamInputSchema,
  response: { 201: okResponse(teamDtoSchema) },
}

export const getTeamRoute = {
  tags: TAGS,
  summary: 'Get a team',
  params: teamParamsSchema,
  response: { 200: okResponse(teamDtoSchema) },
}

export const updateTeamRoute = {
  tags: TAGS,
  summary: 'Rename a team, change its description or lead',
  params: teamParamsSchema,
  body: updateTeamInputSchema,
  response: { 200: okResponse(teamDtoSchema) },
}

export const deleteTeamRoute = {
  tags: TAGS,
  summary: 'Delete a team and everything that applied through it',
  params: teamParamsSchema,
  querystring: deleteTeamQuerySchema,
}

export const teamDeletionImpactRoute = {
  tags: TAGS,
  summary: 'What deleting the team takes away',
  params: teamParamsSchema,
  response: { 200: okResponse(teamDeletionImpactDtoSchema) },
}

export const listTeamMembersRoute = {
  tags: TAGS,
  summary: 'List the members of a team',
  params: teamParamsSchema,
  querystring: listTeamMembersQuerySchema,
  response: { 200: pageResponse(teamMemberDtoSchema) },
}

export const addTeamMembersRoute = {
  tags: TAGS,
  summary: 'Add members of the organization to a team',
  params: teamParamsSchema,
  body: addTeamMembersInputSchema,
  response: { 200: okResponse(addTeamMembersResultDtoSchema) },
}

export const removeTeamMemberRoute = {
  tags: TAGS,
  summary: 'Remove a person from a team',
  params: teamMemberParamsSchema,
}
