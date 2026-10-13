// SPDX-License-Identifier: AGPL-3.0-only
import {
  discoverMcpActionsDtoSchema,
  discoverMcpActionsInputSchema,
  ERROR_CODES,
  okResponse,
  testAgentToolDtoSchema,
  testAgentToolInputSchema,
} from '@surefy/contracts'
import type {
  AgentMcpAction,
  AgentToolFailureCode,
  DiscoverMcpActionsDto,
  TestAgentToolDto,
} from '@surefy/contracts'
import { defineMockHandler, mockError, mockOk } from '@surefy/web-core/testing/mock'

import type { AgentMockStore } from './agentPublishing'

const HTTP_NOT_FOUND = 404
const HTTP_SERVER_ERROR = 500
const NOW = '2026-01-15T09:00:00.000Z'

/** The actions the mock MCP server offers; one of them changes data. */
const MCP_ACTIONS: readonly AgentMcpAction[] = [
  {
    name: 'search_pages',
    description: 'Search the pages of the wiki',
    enabled: true,
    permission: null,
  },
  { name: 'get_page', description: 'Read one page', enabled: true, permission: null },
  { name: 'create_page', description: 'Create a page', enabled: true, permission: null },
  { name: 'delete_page', description: 'Delete a page', enabled: true, permission: null },
]

/** What a mock address stands for: a host or path containing one of these words fails that way. */
const FAILURE_BY_WORD: readonly (readonly [string, AgentToolFailureCode])[] = [
  ['unreachable', ERROR_CODES.CONNECTION_UNREACHABLE],
  ['timeout', ERROR_CODES.AGENT_TOOL_TIMEOUT],
  ['rejected', ERROR_CODES.CONNECTION_PROVIDER_REJECTED],
  ['broken', ERROR_CODES.AGENT_TOOL_BAD_RESPONSE],
]

function failureOf(url: string): AgentToolFailureCode | null {
  const lower = url.toLowerCase()
  return FAILURE_BY_WORD.find(([word]) => lower.includes(word))?.[1] ?? null
}

function failedTest(reasonCode: AgentToolFailureCode): TestAgentToolDto {
  const statusCode = reasonCode === ERROR_CODES.AGENT_TOOL_HTTP_ERROR ? 500 : null
  return {
    ok: false,
    statusCode,
    latencyMs: statusCode ? 210 : null,
    reasonCode,
    responsePreview: statusCode ? '{"error":"Internal Server Error"}' : null,
    truncated: false,
    testedAt: NOW,
  }
}

function failedDiscovery(reasonCode: AgentToolFailureCode): DiscoverMcpActionsDto {
  return { ok: false, latencyMs: null, reasonCode, actions: [], discoveredAt: NOW }
}

const path = '/orgs/:orgId/agents/:agentId/tools'
const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, 'Agent not found')
const serverError = () =>
  mockError(HTTP_SERVER_ERROR, ERROR_CODES.INTERNAL_ERROR, 'The call could not be made')

/**
 * The test call of an API tool and the discovery of an MCP server's actions (Agents › Editor ›
 * Tools). Scenarios: `failed` answers `ok: false` (the address answered with an error status;
 * discovery: nothing answered); `error` fails the request itself. An address containing
 * `unreachable`, `timeout`, `rejected` or `broken` fails with the matching reason.
 */
export function agentToolHandlers(store: Pick<AgentMockStore, 'find'>) {
  return [
    defineMockHandler({
      method: 'post',
      path: `${path}/test`,
      response: okResponse(testAgentToolDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          if (!store.find(params.agentId)) return notFound()
          const input = testAgentToolInputSchema.parse(await request.json())
          const failure = failureOf(input.url)
          if (failure) return mockOk(failedTest(failure))
          const preview = JSON.stringify({ received: input.arguments }, null, 2)
          return mockOk({
            ok: true,
            statusCode: 200,
            latencyMs: 142,
            reasonCode: null,
            responsePreview: preview,
            truncated: false,
            testedAt: NOW,
          })
        },
        failed: () => mockOk(failedTest(ERROR_CODES.AGENT_TOOL_HTTP_ERROR)),
        error: serverError,
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/discover`,
      response: okResponse(discoverMcpActionsDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          if (!store.find(params.agentId)) return notFound()
          const input = discoverMcpActionsInputSchema.parse(await request.json())
          const failure = failureOf(input.serverUrl)
          if (failure) return mockOk(failedDiscovery(failure))
          return mockOk({
            ok: true,
            latencyMs: 96,
            reasonCode: null,
            actions: [...MCP_ACTIONS],
            discoveredAt: NOW,
          })
        },
        failed: () => mockOk(failedDiscovery(ERROR_CODES.CONNECTION_UNREACHABLE)),
        error: serverError,
      },
    }),
  ]
}
