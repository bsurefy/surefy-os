// SPDX-License-Identifier: AGPL-3.0-only
import {
  agentAccessDtoSchema,
  agentDiffQuerySchema,
  agentReadinessDtoSchema,
  agentVersionDetailDtoSchema,
  agentVersionDtoSchema,
  diffAgentDefinitions,
  ERROR_CODES,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  publishAgentInputSchema,
  publishAgentResultDtoSchema,
  replaceAgentAccessInputSchema,
  rollbackAgentInputSchema,
  agentDiffDtoSchema,
  agentDtoSchema,
} from '@surefy/contracts'
import type {
  AgentAccessEntryDto,
  AgentChannelDto,
  AgentDefinition,
  AgentDetailDto,
  AgentReadinessItemDto,
  AgentVersionDetailDto,
} from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'
import { defineMockHandler, mockError, mockOk, mockPage } from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { ANA, SALES_TEAM_ID, SUPPORT_TEAM_ID } from './teams'

const VERSION_KIND = 71
const ACCESS_KIND = 72
const CHANNEL_KIND = 73
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_SERVER_ERROR = 500
const HTTP_UNPROCESSABLE = 422
const PUBLISHED_AT = '2026-01-15T10:00:00.000Z'

/** What the publishing mock needs from the agents mock, which owns the agents themselves. */
export interface AgentMockStore {
  find: (id: unknown) => AgentDetailDto | undefined
  save: (agent: AgentDetailDto) => void
  /** The definition of the version that is live. */
  liveDefinitionOf: (agent: AgentDetailDto) => AgentDefinition
}

/** Models an organization admin keeps from a team: the readiness check names the team. */
const MODEL_BLOCKED_FOR_TEAM: Record<string, string[]> = {
  [SALES_TEAM_ID]: ['openai/gpt-4.1'],
}
const MODEL_NAMES: Record<string, string> = {
  'openai/gpt-4.1': 'GPT-4.1',
  'anthropic/claude-sonnet-4': 'Claude Sonnet 4',
}
const TEAM_NAMES: Record<string, string> = {
  [SUPPORT_TEAM_ID]: 'Support',
  [SALES_TEAM_ID]: 'Sales',
}
/** The organization's thresholds, which an agent's cannot go under. */
const ORGANIZATION_THRESHOLDS = { autoBp: 9000, reviewBp: 6000 }

let sequence = 0
const nextId = (kind: number) => fixtureUuid(kind, ++sequence)

/** Versions per agent, newest first; created from the agent's live version when first asked for. */
let versions = new Map<string, AgentVersionDetailDto[]>()
let accessByAgent = new Map<string, AgentAccessEntryDto[]>()

/** Back to what the agents mock seeds; its reset calls this. */
export function resetAgentPublishingMock(): void {
  sequence = 0
  versions = new Map()
  accessByAgent = new Map()
}

function seedVersions(store: AgentMockStore, agent: AgentDetailDto): AgentVersionDetailDto[] {
  const liveVersion = agent.liveVersion
  if (liveVersion === null) return []
  const live = store.liveDefinitionOf(agent)
  const publishers = [MAYA, OMAR]
  return Array.from({ length: liveVersion }, (_, index) => {
    const number = liveVersion - index
    const isLive = number === liveVersion
    return {
      id: nextId(VERSION_KIND),
      version: number,
      notes: isLive && number > 1 ? 'Added the help center' : null,
      publishedBy: publishers[number % publishers.length] ?? MAYA,
      publishedAt: `2026-01-${String(number + 4).padStart(2, '0')}T09:00:00.000Z`,
      isLive,
      definition:
        number === 1 && liveVersion > 1
          ? {
              ...live,
              instructions: 'You answer customer questions.',
              model: { ...live.model, creativity: 0.2 },
            }
          : live,
    }
  })
}

/** The agent's versions, newest first. */
function versionsOf(store: AgentMockStore, agent: AgentDetailDto): AgentVersionDetailDto[] {
  let found = versions.get(agent.id)
  if (!found) {
    found = seedVersions(store, agent)
    versions.set(agent.id, found)
  }
  return found
}

function accessOf(agent: AgentDetailDto): AgentAccessEntryDto[] {
  let found = accessByAgent.get(agent.id)
  if (!found) {
    found =
      agent.sharedWith.teams.length > 0
        ? agent.sharedWith.teams.map((team) => ({
            id: nextId(ACCESS_KIND),
            subjectType: 'team' as const,
            team,
            user: null,
            level: 'use' as const,
            createdAt: PUBLISHED_AT,
          }))
        : []
    accessByAgent.set(agent.id, found)
  }
  return found
}

/** The audience the agents mock shows on the card, from the access rows. */
function summarize(entries: AgentAccessEntryDto[]): AgentDetailDto['sharedWith'] {
  const teams = entries.flatMap((entry) => (entry.team ? [entry.team] : []))
  return {
    everyone: entries.some((entry) => entry.subjectType === 'organization'),
    teams: teams.slice(0, 3),
    teamCount: teams.length,
    userCount: entries.filter((entry) => entry.subjectType === 'user').length,
  }
}

/** The readiness items for the draft as it stands (Agents › Editor › Publish). */
function readinessOf(agent: AgentDetailDto): AgentReadinessItemDto[] {
  const { definition } = agent.draft
  const audience = accessOf(agent)
  const modelName = MODEL_NAMES[definition.model.modelKey] ?? definition.model.modelKey
  const blockedTeams = audience.flatMap((entry) =>
    entry.team && MODEL_BLOCKED_FOR_TEAM[entry.team.id]?.includes(definition.model.modelKey)
      ? [entry.team]
      : [],
  )
  const modelFailures =
    definition.model.modelKey === 'openai/retired-model'
      ? [{ type: 'model', id: null, name: modelName }]
      : blockedTeams.map((team) => ({ type: 'team', id: team.id, name: team.name }))
  const disconnected = definition.tools.filter(
    (tool) =>
      tool.enabled &&
      (tool.kind === 'mcp' || tool.kind === 'bridge_action') &&
      tool.connectionId === null,
  )
  const { thresholds } = definition.guard
  const isLooser =
    thresholds !== null &&
    (thresholds.autoBp < ORGANIZATION_THRESHOLDS.autoBp ||
      thresholds.reviewBp < ORGANIZATION_THRESHOLDS.reviewBp)
  const unguarded = definition.tools.filter(
    (tool) =>
      tool.enabled &&
      tool.permission === 'can_act' &&
      !definition.guard.approvalRules.some((rule) => rule.match.action === tool.name),
  )
  const item = (
    key: AgentReadinessItemDto['key'],
    severity: AgentReadinessItemDto['severity'],
    tab: AgentReadinessItemDto['tab'],
    failures: AgentReadinessItemDto['failures'],
  ): AgentReadinessItemDto => ({ key, severity, passed: failures.length === 0, tab, failures })
  return [
    item(
      'instructions_present',
      'blocking',
      'instructions',
      definition.instructions.trim() === ''
        ? [{ type: 'instructions', id: null, name: 'Instructions' }]
        : [],
    ),
    item('model_allowed_for_audience', 'blocking', 'model', modelFailures),
    item(
      'tools_connected',
      'blocking',
      'tools',
      disconnected.map((tool) => ({ type: 'tool', id: tool.id, name: tool.name })),
    ),
    item(
      'guard_not_looser',
      'blocking',
      'guard',
      isLooser ? [{ type: 'thresholds', id: null, name: 'Thresholds' }] : [],
    ),
    // there are no test runs in the mock yet
    item('tested_since_change', 'warning', 'test', [{ type: 'test', id: null, name: 'Test run' }]),
    item(
      'can_act_without_approval_rule',
      'warning',
      'guard',
      unguarded.map((tool) => ({ type: 'tool', id: tool.id, name: tool.name })),
    ),
  ]
}

function channel(
  agent: AgentDetailDto,
  type: AgentChannelDto['type'],
  status: AgentChannelDto['status'],
): AgentChannelDto {
  return {
    id: nextId(CHANNEL_KIND),
    agentId: agent.id,
    type,
    status,
    config: {
      version: 1,
      ...(type === 'api' ? { api: { rateLimitPerMinute: 60 } } : {}),
      exposure: {
        knowledgeBases: [],
        tools: [],
      },
    },
    publicTokenPrefix: null,
    externalAccountId: null,
    connection: null,
    approvalId: status === 'pending_approval' ? fixtureUuid(74, sequence) : null,
    requestedBy: type === 'api' ? MAYA : null,
    approvedBy: status === 'active' ? ANA : null,
    lastErrorCode: null,
    lastActiveAt: null,
    createdAt: PUBLISHED_AT,
    updatedAt: PUBLISHED_AT,
  }
}

const userOf = (userId: string) => [MAYA, OMAR, ANA].find(({ id }) => id === userId) ?? MAYA

const path = '/orgs/:orgId/agents/:agentId'
const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, 'Agent not found')
const versionNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_VERSION_NOT_FOUND, 'Version not found')

/**
 * Versions, readiness, publishing, rollback and the audience of an agent (Agents › Editor ›
 * Publish and Versions). Scenarios: `pending-approval` on a publish leaves the external channels
 * waiting for an Admin; `error` fails a publish, a rollback or an audience change.
 */
export function agentPublishingHandlers(store: AgentMockStore) {
  return [
    defineMockHandler({
      method: 'get',
      path: `${path}/versions`,
      response: pageResponse(agentVersionDtoSchema),
      scenarios: {
        default: ({ params, request }) => {
          const agent = store.find(params.agentId)
          if (!agent) return notFound()
          const all = versionsOf(store, agent).map((version) =>
            agentVersionDtoSchema.parse(version),
          )
          const url = new URL(request.url)
          const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
          const start = Number(url.searchParams.get('cursor') ?? 0)
          const next = start + limit < all.length ? String(start + limit) : null
          return mockPage(all.slice(start, start + limit), next)
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/versions/:versionId`,
      response: okResponse(agentVersionDetailDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const agent = store.find(params.agentId)
          if (!agent) return notFound()
          const version = versionsOf(store, agent).find(({ id }) => id === params.versionId)
          return version ? mockOk(version) : versionNotFound()
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/versions/:versionId/diff`,
      response: okResponse(agentDiffDtoSchema),
      scenarios: {
        default: ({ params, request }) => {
          const agent = store.find(params.agentId)
          if (!agent) return notFound()
          const all = versionsOf(store, agent)
          const version = all.find(({ id }) => id === params.versionId)
          if (!version) return versionNotFound()
          const { against } = agentDiffQuerySchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          )
          const other =
            against === 'draft'
              ? agent.draft.definition
              : all.find(({ id, isLive }) => (against === 'live' ? isLive : id === against))
                  ?.definition
          return other
            ? mockOk({ changes: diffAgentDefinitions(version.definition, other) })
            : versionNotFound()
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/readiness`,
      response: okResponse(agentReadinessDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const agent = store.find(params.agentId)
          if (!agent) return notFound()
          const items = readinessOf(agent)
          return mockOk({
            items,
            canPublish: items.every((entry) => entry.severity === 'warning' || entry.passed),
          })
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/access`,
      response: okResponse(agentAccessDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const agent = store.find(params.agentId)
          return agent ? mockOk({ entries: accessOf(agent) }) : notFound()
        },
      },
    }),
    defineMockHandler({
      method: 'put',
      path: `${path}/access`,
      response: okResponse(agentAccessDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const agent = store.find(params.agentId)
          if (!agent) return notFound()
          const { entries } = replaceAgentAccessInputSchema.parse(await request.json())
          const saved: AgentAccessEntryDto[] = entries.map((entry) => ({
            id: nextId(ACCESS_KIND),
            subjectType: entry.subjectType,
            team:
              entry.subjectType === 'team'
                ? { id: entry.teamId, name: TEAM_NAMES[entry.teamId] ?? 'Team' }
                : null,
            user: entry.subjectType === 'user' ? userOf(entry.userId) : null,
            level: entry.level,
            createdAt: PUBLISHED_AT,
          }))
          accessByAgent.set(agent.id, saved)
          store.save({ ...agent, sharedWith: summarize(saved) })
          return mockOk({ entries: saved })
        },
        error: () =>
          mockError(
            HTTP_UNPROCESSABLE,
            ERROR_CODES.AGENT_MODEL_NOT_ALLOWED_FOR_AUDIENCE,
            'The model is not allowed for this audience',
          ),
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/publish`,
      response: okResponse(publishAgentResultDtoSchema),
      scenarios: {
        default: async ({ params, request }) => publish(store, params.agentId, request, false),
        'pending-approval': async ({ params, request }) =>
          publish(store, params.agentId, request, true),
        error: () =>
          mockError(
            HTTP_SERVER_ERROR,
            ERROR_CODES.INTERNAL_ERROR,
            'The agent could not be published',
          ),
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/rollback`,
      response: okResponse(agentDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const agent = store.find(params.agentId)
          if (!agent) return notFound()
          if (agent.liveVersion === null) {
            return mockError(HTTP_CONFLICT, ERROR_CODES.AGENT_NOT_PUBLISHED, 'Nothing is live yet')
          }
          const { versionId } = rollbackAgentInputSchema.parse(await request.json())
          const all = versionsOf(store, agent)
          const target = all.find(({ id }) => id === versionId)
          if (!target) return versionNotFound()
          versions.set(
            agent.id,
            all.map((version) => ({ ...version, isLive: version.id === versionId })),
          )
          const updated = {
            ...agent,
            liveVersion: target.version,
            hasUnpublishedChanges:
              diffAgentDefinitions(target.definition, agent.draft.definition).length > 0,
          }
          store.save(updated)
          return mockOk(agentDtoSchema.parse(updated))
        },
        error: () =>
          mockError(
            HTTP_SERVER_ERROR,
            ERROR_CODES.INTERNAL_ERROR,
            'The agent could not be rolled back',
          ),
      },
    }),
  ]
}

async function publish(
  store: AgentMockStore,
  agentId: unknown,
  request: Request,
  needsApproval: boolean,
) {
  const agent = store.find(agentId)
  if (!agent) return notFound()
  if (agent.status === 'archived') {
    return mockError(HTTP_CONFLICT, ERROR_CODES.AGENT_NOT_EDITABLE, 'Archived agents are read-only')
  }
  const input = publishAgentInputSchema.parse(await request.json())
  if (input.baseRevision !== agent.draft.revision) {
    return mockError(HTTP_CONFLICT, ERROR_CODES.AGENT_EDIT_CONFLICT, 'The draft changed')
  }
  if (readinessOf(agent).some((entry) => entry.severity === 'blocking' && !entry.passed)) {
    return mockError(HTTP_UNPROCESSABLE, ERROR_CODES.AGENT_NOT_READY, 'The agent is not ready')
  }
  const previous = versionsOf(store, agent)
  const version: AgentVersionDetailDto = {
    id: nextId(VERSION_KIND),
    version: (agent.liveVersion ?? previous[0]?.version ?? 0) + 1,
    notes: input.notes ?? null,
    publishedBy: MAYA,
    publishedAt: PUBLISHED_AT,
    isLive: true,
    definition: agent.draft.definition,
  }
  versions.set(agent.id, [version, ...previous.map((entry) => ({ ...entry, isLive: false }))])
  const existing = agent.channels
  const channels = [
    ...existing,
    ...(existing.some(({ type }) => type === 'workspace_chat')
      ? []
      : [channel(agent, 'workspace_chat', 'active')]),
    ...input.channels
      .filter(({ type }) => !existing.some((entry) => entry.type === type))
      .map(({ type }) => channel(agent, type, needsApproval ? 'pending_approval' : 'active')),
  ]
  const published: AgentDetailDto = {
    ...agent,
    status: 'active',
    liveVersion: version.version,
    hasUnpublishedChanges: false,
    channels,
    draft: { ...agent.draft, revision: agent.draft.revision + 1 },
  }
  store.save(published)
  return mockOk(
    publishAgentResultDtoSchema.parse({
      agent: published,
      version,
      channels,
      widgetTokens: {},
    }),
  )
}
