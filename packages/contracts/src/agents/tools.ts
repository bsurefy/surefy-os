// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { agentMcpActionSchema, agentToolHeaderSchema, AGENT_HTTP_METHODS } from './definition.js'
import { AGENTS_ERROR_CODES } from './errors.js'
import { AGENT_RUNS_ERROR_CODES } from '../agentRuns/errors.js'
import { CONNECTIONS_ERROR_CODES } from '../connections/errors.js'

// Trying a tool while it is built (Agents › Editor › Tools). Routes, under
// /api/v1/orgs/:orgId/agents/:agentId/tools: POST /test (an API tool) · POST /discover (an MCP
// server). Both take the tool as it stands in the editor, not a saved one, and both go out through
// the safe outbound client with the connection's credentials. A failed call is a normal answer
// (`ok: false` with the reason), not an HTTP error. Nothing is stored and no run is created.

/** The most of a response the test call shows; the rest is cut. */
export const AGENT_TOOL_TEST_PREVIEW_MAX_LENGTH = 4000

/** Time the server waits for a tool or an MCP server to answer a test call or a discovery. */
export const AGENT_TOOL_TEST_TIMEOUT_SECONDS = 20

/** Why a test call or a discovery failed (all values are API error codes). */
export const AGENT_TOOL_FAILURE_CODES = [
  CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE,
  CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
  CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED,
  CONNECTIONS_ERROR_CODES.CONNECTION_REVOKED,
  AGENT_RUNS_ERROR_CODES.AGENT_TOOL_TIMEOUT,
  AGENTS_ERROR_CODES.AGENT_TOOL_HTTP_ERROR,
  AGENTS_ERROR_CODES.AGENT_TOOL_BAD_RESPONSE,
] as const
export type AgentToolFailureCode = (typeof AGENT_TOOL_FAILURE_CODES)[number]
export const agentToolFailureCodeSchema = z.enum(AGENT_TOOL_FAILURE_CODES)

/** `POST …/tools/test`: the request the API tool would send, with the arguments the model would fill in. */
export const testAgentToolInputSchema = z.object({
  method: z.enum(AGENT_HTTP_METHODS),
  url: z.url({ protocol: /^https?$/ }).max(2048),
  headers: z.array(agentToolHeaderSchema).max(20),
  connectionId: z.uuid().nullable(),
  /** Sent as the query string (GET, DELETE) or the JSON body (POST, PUT, PATCH). */
  arguments: z.record(z.string(), z.unknown()),
})
export type TestAgentToolInput = z.infer<typeof testAgentToolInputSchema>

export const testAgentToolDtoSchema = z.object({
  ok: z.boolean(),
  /** The HTTP status the tool's address answered with; null when nothing answered. */
  statusCode: z.number().int().min(100).max(599).nullable(),
  /** Round trip of the call; null when nothing answered. */
  latencyMs: z.number().int().nonnegative().nullable(),
  reasonCode: agentToolFailureCodeSchema.nullable(),
  /** The start of the response body, secrets masked; null when there is none. */
  responsePreview: z.string().max(AGENT_TOOL_TEST_PREVIEW_MAX_LENGTH).nullable(),
  /** The body was longer than the preview. */
  truncated: z.boolean(),
  testedAt: z.iso.datetime(),
})
export type TestAgentToolDto = z.infer<typeof testAgentToolDtoSchema>

/** `POST …/tools/discover`: connect to an MCP server and list what it offers. */
export const discoverMcpActionsInputSchema = z.object({
  serverUrl: z.url({ protocol: /^https?$/ }).max(2048),
  connectionId: z.uuid().nullable(),
})
export type DiscoverMcpActionsInput = z.infer<typeof discoverMcpActionsInputSchema>

export const discoverMcpActionsDtoSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative().nullable(),
  reasonCode: agentToolFailureCodeSchema.nullable(),
  /** Every action starts on and follows the tool's permission (`permission: null`); empty on failure. */
  actions: z.array(agentMcpActionSchema).max(200),
  discoveredAt: z.iso.datetime(),
})
export type DiscoverMcpActionsDto = z.infer<typeof discoverMcpActionsDtoSchema>
