// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentAccessDto,
  AgentDetailDto,
  AgentDto,
  AgentReadinessDto,
  AgentVersionDetailDto,
  AgentVersionDto,
  DiscoverMcpActionsDto,
  DiscoverMcpActionsInput,
  PublishAgentInput,
  PublishAgentResultDto,
  ReplaceAgentAccessInput,
  RollbackAgentInput,
  SaveAgentDraftDto,
  SaveAgentDraftInput,
  TestAgentToolDto,
  TestAgentToolInput,
  UpdateAgentInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { AgentVersionListFilters } from './agents.queries'

/** Agents: the editor's agent with its draft, live metadata, and the versions it reads. */
export const agentsApi = {
  get: (http: HttpClient, orgId: string, agentId: string, signal?: AbortSignal) =>
    http.get<AgentDetailDto>(`/orgs/${orgId}/agents/${agentId}`, { signal }),
  /** Live metadata (name, description): saved directly and not versioned. */
  update: (http: HttpClient, orgId: string, agentId: string, input: UpdateAgentInput) =>
    http.patch<AgentDto>(`/orgs/${orgId}/agents/${agentId}`, input),
  /** Autosave. A moved draft answers `409 AGENT_EDIT_CONFLICT` and saves nothing. */
  saveDraft: (http: HttpClient, orgId: string, agentId: string, input: SaveAgentDraftInput) =>
    http.put<SaveAgentDraftDto>(`/orgs/${orgId}/agents/${agentId}/draft`, input),
  versions: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    query: AgentVersionListFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<AgentVersionDto>(`/orgs/${orgId}/agents/${agentId}/versions`, {
      params: { ...query },
      signal,
    }),
  version: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    versionId: string,
    signal?: AbortSignal,
  ) =>
    http.get<AgentVersionDetailDto>(`/orgs/${orgId}/agents/${agentId}/versions/${versionId}`, {
      signal,
    }),
  /** Whether the draft can be published: the blocking items and the warnings. */
  readiness: (http: HttpClient, orgId: string, agentId: string, signal?: AbortSignal) =>
    http.get<AgentReadinessDto>(`/orgs/${orgId}/agents/${agentId}/readiness`, { signal }),
  /** One transaction: a version, the live pointer, the channels. A failed publish changes nothing. */
  publish: (http: HttpClient, orgId: string, agentId: string, input: PublishAgentInput) =>
    http.post<PublishAgentResultDto>(`/orgs/${orgId}/agents/${agentId}/publish`, input),
  /** Points the live version at an earlier one (T2); creates no version and leaves the draft alone. */
  rollback: (http: HttpClient, orgId: string, agentId: string, input: RollbackAgentInput) =>
    http.post<AgentDto>(`/orgs/${orgId}/agents/${agentId}/rollback`, input),
  /** Who can use the agent: live metadata, not versioned. */
  access: (http: HttpClient, orgId: string, agentId: string, signal?: AbortSignal) =>
    http.get<AgentAccessDto>(`/orgs/${orgId}/agents/${agentId}/access`, { signal }),
  replaceAccess: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    input: ReplaceAgentAccessInput,
  ) => http.put<AgentAccessDto>(`/orgs/${orgId}/agents/${agentId}/access`, input),
  /**
   * Sends the request an API tool would send, as it stands in the editor. A failed call is an
   * answer with `ok: false`, not an error.
   */
  testTool: (http: HttpClient, orgId: string, agentId: string, input: TestAgentToolInput) =>
    http.post<TestAgentToolDto>(`/orgs/${orgId}/agents/${agentId}/tools/test`, input),
  /** Connects to an MCP server and lists the actions it offers. */
  discoverMcpActions: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    input: DiscoverMcpActionsInput,
  ) => http.post<DiscoverMcpActionsDto>(`/orgs/${orgId}/agents/${agentId}/tools/discover`, input),
}
