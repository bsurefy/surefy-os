// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentAccessDto,
  AgentChannelCreatedDto,
  AgentChannelDto,
  AgentDetailDto,
  AgentDto,
  AgentImpactDto,
  AgentLifecycleAction,
  AgentTemplateListDto,
  AgentReadinessDto,
  AgentVersionDetailDto,
  AgentVersionDto,
  CreateAgentInput,
  DeleteAgentQuery,
  DiscoverMcpActionsDto,
  DiscoverMcpActionsInput,
  DuplicateAgentInput,
  PublishAgentInput,
  PublishAgentResultDto,
  ReplaceAgentAccessInput,
  RollbackAgentInput,
  SaveAgentDraftDto,
  SaveAgentDraftInput,
  TestAgentToolDto,
  TestAgentToolInput,
  UpdateAgentChannelInput,
  UpdateAgentInput,
  UsableAgentDto,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type {
  AgentListFilters,
  AgentVersionListFilters,
  UsableAgentFilters,
} from './agents.queries'

/** Agents: the editor's agent with its draft, live metadata, and the versions it reads. */
export const agentsApi = {
  list: (http: HttpClient, orgId: string, query: AgentListFilters, signal?: AbortSignal) =>
    http.getPage<AgentDto>(`/orgs/${orgId}/agents`, { params: { ...query }, signal }),
  /** Agents shared with the signed-in person, as Chat lists them (`agents:invoke`). */
  usable: (http: HttpClient, orgId: string, query: UsableAgentFilters, signal?: AbortSignal) =>
    http.getPage<UsableAgentDto>(`/orgs/${orgId}/agents/usable`, {
      params: { ...query },
      signal,
    }),
  /** From a template, or from scratch without a template key; counts toward the plan's agent limit. */
  create: (http: HttpClient, orgId: string, input: CreateAgentInput) =>
    http.post<AgentDto>(`/orgs/${orgId}/agents`, input),
  /** A draft copy owned by the caller, with no channels and no audience. */
  duplicate: (http: HttpClient, orgId: string, agentId: string, input: DuplicateAgentInput) =>
    http.post<AgentDto>(`/orgs/${orgId}/agents/${agentId}/duplicate`, input),
  /** `pause`, `resume`, `archive` and `restore`; any other transition answers `AGENT_STATE_INVALID`. */
  lifecycle: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    action: Exclude<AgentLifecycleAction, 'delete'>,
  ) => http.post<AgentDto>(`/orgs/${orgId}/agents/${agentId}/${action}`, {}),
  /** What a pause, an archive or a delete affects: shared teams, live channels, runs. */
  impact: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    action: 'pause' | 'archive' | 'delete',
    signal?: AbortSignal,
  ) =>
    http.get<AgentImpactDto>(`/orgs/${orgId}/agents/${agentId}/impact`, {
      params: { action },
      signal,
    }),
  /** A never-published agent is deleted outright; a published one needs its name and a reason. */
  remove: (http: HttpClient, orgId: string, agentId: string, query: DeleteAgentQuery = {}) =>
    http.delete(`/orgs/${orgId}/agents/${agentId}`, { params: { ...query } }),
  /** The code-only templates, with what each needs from this organization. */
  templates: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<AgentTemplateListDto>(`/orgs/${orgId}/agents/templates`, { signal }),
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
  /** A live channel's settings (Admins); a channel waiting for an approval cannot change yet. */
  updateChannel: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    channelId: string,
    input: UpdateAgentChannelInput,
  ) => http.patch<AgentChannelDto>(`/orgs/${orgId}/agents/${agentId}/channels/${channelId}`, input),
  /** `pause` stops the channel answering; `resume` turns it on again, or retries one in error. */
  channelAction: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    channelId: string,
    action: 'pause' | 'resume',
  ) =>
    http.post<AgentChannelDto>(
      `/orgs/${orgId}/agents/${agentId}/channels/${channelId}/${action}`,
      {},
    ),
  /**
   * A new widget token, returned once; the previous one stops working at once. Anyone who can edit
   * the agent issues the first token of a widget approved after their request.
   */
  rotateChannelToken: (http: HttpClient, orgId: string, agentId: string, channelId: string) =>
    http.post<AgentChannelCreatedDto>(
      `/orgs/${orgId}/agents/${agentId}/channels/${channelId}/rotate-token`,
      {},
    ),
  /** Turns a channel off; a Builder takes back a request that waits. */
  removeChannel: (http: HttpClient, orgId: string, agentId: string, channelId: string) =>
    http.delete(`/orgs/${orgId}/agents/${agentId}/channels/${channelId}`),
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
