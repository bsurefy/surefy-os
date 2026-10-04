// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  meDtoSchema,
  okResponse,
  revokeOtherSessionsResultDtoSchema,
  sessionDtoSchema,
  sessionParamsSchema,
  signInOptionsDtoSchema,
  updateMeInputSchema,
} from '@surefy/contracts'

const TAGS = ['auth']

export const getMeRoute = {
  tags: TAGS,
  summary: 'Get the signed-in person, their preferences, session and memberships',
  response: { 200: okResponse(meDtoSchema) },
}

export const updateMeRoute = {
  tags: TAGS,
  summary: 'Update the profile and personal preferences',
  body: updateMeInputSchema,
  response: { 200: okResponse(meDtoSchema) },
}

export const listSessionsRoute = {
  tags: TAGS,
  summary: "List the signed-in person's active sessions, newest first (at most 100)",
  response: { 200: okResponse(z.array(sessionDtoSchema)) },
}

export const revokeSessionRoute = {
  tags: TAGS,
  summary: 'End one of the signed-in person’s sessions',
  params: sessionParamsSchema,
}

export const revokeOtherSessionsRoute = {
  tags: TAGS,
  summary: 'End every other session of the signed-in person',
  response: { 200: okResponse(revokeOtherSessionsResultDtoSchema) },
}

export const signInOptionsRoute = {
  tags: TAGS,
  summary: 'What the sign-in and sign-up screens offer on this install',
  response: { 200: okResponse(signInOptionsDtoSchema) },
}
