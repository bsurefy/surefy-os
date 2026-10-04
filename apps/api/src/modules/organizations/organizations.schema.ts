// SPDX-License-Identifier: AGPL-3.0-only
import {
  createOrganizationInputSchema,
  okResponse,
  organizationDtoSchema,
  orgParamsSchema,
  slugAvailabilityDtoSchema,
  slugAvailabilityQuerySchema,
  updateOrganizationInputSchema,
} from '@surefy/contracts'

const TAGS = ['organizations']

export const getOrganizationRoute = {
  tags: TAGS,
  summary: 'Get the organization',
  params: orgParamsSchema,
  response: { 200: okResponse(organizationDtoSchema) },
}

export const updateOrganizationRoute = {
  tags: TAGS,
  summary: 'Update the organization name, URL, regional settings and settings',
  params: orgParamsSchema,
  body: updateOrganizationInputSchema,
  response: { 200: okResponse(organizationDtoSchema) },
}

export const createOrganizationRoute = {
  tags: TAGS,
  summary: 'Create an organization; the signed-in person becomes its Owner',
  body: createOrganizationInputSchema,
  response: { 201: okResponse(organizationDtoSchema) },
}

export const slugAvailabilityRoute = {
  tags: TAGS,
  summary: 'Check whether an organization URL can be used',
  querystring: slugAvailabilityQuerySchema,
  response: { 200: okResponse(slugAvailabilityDtoSchema) },
}
