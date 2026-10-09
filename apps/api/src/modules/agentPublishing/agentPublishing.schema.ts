// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  agentRunStreamQuerySchema,
  okResponse,
  publicRunDtoSchema,
  publicRunInputSchema,
  publicRunParamsSchema,
} from '@surefy/contracts'

const TAGS = ['agent runs']

/**
 * `202` with the run and a `Location` header, or `200 text/event-stream` with `?stream=true`
 * (the event stream of the run, see contracts `stream.ts`).
 */
export const startPublicRunRoute = {
  tags: TAGS,
  summary: "Starts a run of a published agent over the API channel (API key with 'agents:invoke')",
  params: publicRunParamsSchema,
  querystring: agentRunStreamQuerySchema,
  headers: z.object({ 'idempotency-key': z.string().trim().min(1).max(255).optional() }),
  body: publicRunInputSchema,
  response: { 202: okResponse(publicRunDtoSchema) },
}
