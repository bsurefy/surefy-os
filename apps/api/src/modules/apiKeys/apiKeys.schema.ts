// SPDX-License-Identifier: AGPL-3.0-only
import {
  apiKeyCreatedDtoSchema,
  apiKeyDtoSchema,
  apiKeyImpactDtoSchema,
  apiKeyParamsSchema,
  createApiKeyInputSchema,
  listApiKeysQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  updateApiKeyInputSchema,
} from '@surefy/contracts'

const TAGS = ['apiKeys']

export const listApiKeysRoute = {
  tags: TAGS,
  summary: 'List the API keys of the organization',
  params: orgParamsSchema,
  querystring: listApiKeysQuerySchema,
  response: { 200: pageResponse(apiKeyDtoSchema) },
}

export const createApiKeyRoute = {
  tags: TAGS,
  summary: 'Create an API key; the full key is in this answer only. Needs a fresh session',
  params: orgParamsSchema,
  body: createApiKeyInputSchema,
  response: { 201: okResponse(apiKeyCreatedDtoSchema) },
}

export const getApiKeyRoute = {
  tags: TAGS,
  summary: 'Get an API key',
  params: apiKeyParamsSchema,
  response: { 200: okResponse(apiKeyDtoSchema) },
}

export const updateApiKeyRoute = {
  tags: TAGS,
  summary: 'Rename an API key',
  params: apiKeyParamsSchema,
  body: updateApiKeyInputSchema,
  response: { 200: okResponse(apiKeyDtoSchema) },
}

export const apiKeyImpactRoute = {
  tags: TAGS,
  summary: 'What stops working when the key is revoked',
  params: apiKeyParamsSchema,
  response: { 200: okResponse(apiKeyImpactDtoSchema) },
}

export const revokeApiKeyRoute = {
  tags: TAGS,
  summary: 'Revoke an API key; calls with it fail at once',
  params: apiKeyParamsSchema,
  response: { 200: okResponse(apiKeyDtoSchema) },
}
