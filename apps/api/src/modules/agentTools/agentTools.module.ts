// SPDX-License-Identifier: AGPL-3.0-only
import { McpClient } from '@/integrations/mcp/index.js'
import { APP_VERSION } from '@/lib/appVersion.js'

import { AgentToolsService, type AgentToolsServiceDeps } from './agentTools.service.js'
import { ApiToolAdapter } from './agentToolsApi.js'
import { McpToolAdapter } from './agentToolsMcp.js'
import { ToolProbe } from './agentToolsProbe.js'
import { SchemaCache } from './agentToolsSchemas.js'
import { WebSearchToolAdapter } from './agentToolsWebSearch.js'

import type { AgentToolsConnections, AgentToolsWebSearch } from './agentTools.types.js'
import type { OutboundHttp } from '@/modules/connections/index.js'

export interface AgentToolsModuleDeps {
  /** `connections.service`: a tool opens its connection for one call. */
  connections: AgentToolsConnections
  /** The safe outbound client of the connections module: every tool request leaves through it. */
  http: OutboundHttp
  /** Web search for the `web_search` tool, read when a call runs because it is built later. */
  webSearch?: () => AgentToolsWebSearch
  /** The deadline, retry pauses and sleep of a call; tests shorten them. */
  timing?: Pick<AgentToolsServiceDeps, 'timeoutMs' | 'retryDelaysMs' | 'sleep'>
}

/** Tool adapters for agent runs: API tools, MCP servers and web search. No routes; the executor calls the service. */
export function createAgentToolsModule(deps: AgentToolsModuleDeps) {
  const client = new McpClient({
    send: (url, request) => deps.http.external(url, request),
    clientName: 'SurefyOS',
    clientVersion: APP_VERSION,
  })
  const mcp = new McpToolAdapter({
    connections: deps.connections,
    client,
    schemas: new SchemaCache(),
  })
  const api = new ApiToolAdapter({ connections: deps.connections, http: deps.http })
  return {
    service: new AgentToolsService({
      adapters: [
        api,
        mcp,
        ...(deps.webSearch === undefined ? [] : [new WebSearchToolAdapter(deps.webSearch)]),
      ],
      mcp,
      ...deps.timing,
    }),
    /** The editor's test call and discovery; the agents module's routes call it. */
    probe: new ToolProbe({ connections: deps.connections, http: deps.http, mcp }),
  }
}
export type AgentToolsModule = ReturnType<typeof createAgentToolsModule>
