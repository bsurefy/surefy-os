// SPDX-License-Identifier: AGPL-3.0-only
import {
  completeSetupInputSchema,
  okResponse,
  orgParamsSchema,
  setupChecklistDtoSchema,
  setupInputSchema,
  setupResultDtoSchema,
  setupStatusDtoSchema,
} from '@surefy/contracts'

const TAGS = ['setup']

export const setupStatusRoute = {
  tags: TAGS,
  summary: 'Whether first-run setup is complete, and the server check while it is not',
  response: { 200: okResponse(setupStatusDtoSchema) },
}

export const runSetupRoute = {
  tags: TAGS,
  summary: 'Create the first Owner, organization and install administrator, and sign in',
  body: setupInputSchema,
  response: { 201: okResponse(setupResultDtoSchema) },
}

export const completeSetupRoute = {
  tags: TAGS,
  summary: 'Finish setup, recording the skipped steps',
  params: orgParamsSchema,
  body: completeSetupInputSchema,
}

export const setupChecklistRoute = {
  tags: TAGS,
  summary: 'The home-screen setup checklist',
  params: orgParamsSchema,
  response: { 200: okResponse(setupChecklistDtoSchema) },
}
