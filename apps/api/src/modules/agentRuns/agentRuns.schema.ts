// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  agentParamsSchema,
  agentRunDetailDtoSchema,
  agentRunDtoSchema,
  agentRunEventsQuerySchema,
  agentRunParamsSchema,
  agentRunStepDetailDtoSchema,
  agentRunStepParamsSchema,
  agentRunStepsDtoSchema,
  agentRunStreamQuerySchema,
  listAgentRunsQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  publicRunDtoSchema,
  retryAgentRunInputSchema,
  startTestRunInputSchema,
} from '@surefy/contracts'

const TAGS = ['agent runs']

/** A run as the caller sees it: the full detail for a person, the public view for an API key. */
const runOrPublic = z.union([agentRunDetailDtoSchema, publicRunDtoSchema])

export const listAgentRunsRoute = {
  tags: TAGS,
  summary: 'Insights › Runs: runs of the agents the person can edit and their own',
  params: orgParamsSchema,
  querystring: listAgentRunsQuerySchema,
  response: { 200: pageResponse(agentRunDtoSchema) },
}

export const listAgentRunsOfAgentRoute = {
  tags: TAGS,
  summary: "An agent's Runs tab",
  params: agentParamsSchema,
  querystring: listAgentRunsQuerySchema.omit({ agentId: true }),
  response: { 200: pageResponse(agentRunDtoSchema) },
}

export const getAgentRunRoute = {
  tags: TAGS,
  summary: 'Run detail; an API key gets the public view of a run it started',
  params: agentRunParamsSchema,
  response: { 200: okResponse(runOrPublic) },
}

export const listAgentRunStepsRoute = {
  tags: TAGS,
  summary: 'The waterfall of a run: every step without its data',
  params: agentRunParamsSchema,
  response: { 200: okResponse(agentRunStepsDtoSchema) },
}

export const getAgentRunStepRoute = {
  tags: TAGS,
  summary: 'One step with its input and output',
  params: agentRunStepParamsSchema,
  response: { 200: okResponse(agentRunStepDetailDtoSchema) },
}

export const cancelAgentRunRoute = {
  tags: TAGS,
  summary: 'Ends a run that has not ended; steps already done are not undone',
  params: agentRunParamsSchema,
  response: { 200: okResponse(runOrPublic) },
}

export const retryAgentRunRoute = {
  tags: TAGS,
  summary: 'Starts a new run with the same input, or from the failed step of a test run',
  params: agentRunParamsSchema,
  body: retryAgentRunInputSchema,
  response: { 201: okResponse(agentRunDetailDtoSchema) },
}

/** `?stream=true` answers with the run's event stream (`text/event-stream`) instead of the run. */
export const startTestRunRoute = {
  tags: TAGS,
  summary: "Runs the agent's draft in the editor's sandbox",
  params: agentParamsSchema,
  querystring: agentRunStreamQuerySchema,
  body: startTestRunInputSchema,
  response: { 201: okResponse(agentRunDetailDtoSchema) },
}

/** `200 text/event-stream` in the AI SDK UI message stream format; see contracts `stream.ts`. */
export const agentRunEventsRoute = {
  tags: TAGS,
  summary: "The run's live event stream; reconnect with Last-Event-ID or ?after=",
  params: agentRunParamsSchema,
  querystring: agentRunEventsQuerySchema,
}
