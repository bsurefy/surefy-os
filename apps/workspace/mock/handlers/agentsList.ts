// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  agentDtoSchema,
  agentImpactDtoSchema,
  agentTemplateListDtoSchema,
  createAgentInputSchema,
  createEmptyAgentDefinition,
  duplicateAgentInputSchema,
  ERROR_CODES,
  okResponse,
  PAGE_SIZE,
  pageResponse,
} from '@surefy/contracts'
import type { AgentDetailDto, AgentDto } from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'
import { defineMockHandler, mockError, mockOk, mockPage } from '@surefy/web-core/testing/mock'

import {
  AGENT_KIND,
  ARCHIVED_AGENT_ID,
  READ_ONLY_AGENT_ID,
  RETIRED_MODEL_AGENT_ID,
  SUPPORT_AGENT_ID,
} from './agentIds'
import { AGENT_TEMPLATES } from './agentTemplates.fixtures'
import { MAYA } from './shell.fixtures'

import type { AgentMockStore } from './agentPublishing'

const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_FORBIDDEN = 403
const NOW = '2026-01-15T09:00:00.000Z'
const GPT = {
  modelKey: 'openai/gpt-4.1',
  displayName: 'GPT-4.1',
  providerKey: 'openai',
  source: 'provider',
} as const

/** What the list shows beyond the editor's agent: run figures, trust and attention. */
const LIST_STATS: Record<string, Partial<AgentDto>> = {
  [SUPPORT_AGENT_ID]: {
    lastRun: { status: 'succeeded', at: '2026-01-15T08:40:00.000Z' },
    runsThisWeek: 142,
    approvalsWaiting: 3,
    trust: { score: 0.93, runs: 310 },
  },
  [READ_ONLY_AGENT_ID]: {
    lastRun: { status: 'succeeded', at: '2026-01-14T16:00:00.000Z' },
    runsThisWeek: 8,
    trust: { score: null, runs: 8 },
  },
  [RETIRED_MODEL_AGENT_ID]: {
    lastRun: { status: 'failed', at: '2026-01-15T07:00:00.000Z' },
    runsThisWeek: 31,
    trust: { score: 0.58, runs: 120 },
    needsAttention: ['model_not_allowed', 'recent_runs_failed'],
  },
}
const RUN_COUNTS: Record<string, number> = {
  [SUPPORT_AGENT_ID]: 4812,
  [READ_ONLY_AGENT_ID]: 8,
  [RETIRED_MODEL_AGENT_ID]: 120,
  [ARCHIVED_AGENT_ID]: 56,
}
/** The agent without the editor's draft and channels, plus the list-only figures. */
const toListAgent = (agent: AgentDetailDto): AgentDto =>
  agentDtoSchema.parse({ ...agent, ...LIST_STATS[agent.id] })

/** The list-only figures of an agent (`runCount` for the delete confirmation). */
const runCountOf = (agentId: string) => RUN_COUNTS[agentId] ?? 0

const byLastRun = (a: AgentDto, b: AgentDto) =>
  Date.parse(a.lastRun?.at ?? '0') - Date.parse(b.lastRun?.at ?? '0')
const BY: Record<string, (a: AgentDto, b: AgentDto) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  runsThisWeek: (a, b) => a.runsThisWeek - b.runsThisWeek,
}

let created = 0

/** Back to the seeded agents; the agents mock's reset calls this. */
export function resetAgentsListMock(): void {
  created = 0
}

/** The agent list, the templates, creating, duplicating, the lifecycle and deleting. */
export function agentListHandlers(
  store: AgentMockStore & {
    all: () => AgentDetailDto[]
    add: (agent: AgentDetailDto) => void
    remove: (id: string) => void
  },
) {
  const path = '/orgs/:orgId/agents'
  const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, 'Agent not found')
  const invalid = () =>
    mockError(HTTP_CONFLICT, ERROR_CODES.AGENT_STATE_INVALID, 'That cannot be done now')
  const newAgent = (name: string, draftFrom?: AgentDetailDto): AgentDetailDto => {
    created += 1
    return {
      id: fixtureUuid(AGENT_KIND, 50 + created),
      name,
      description: draftFrom?.description ?? null,
      status: 'draft',
      owner: MAYA,
      model: draftFrom?.model ?? null,
      liveVersion: null,
      hasUnpublishedChanges: false,
      templateKey: null,
      sharedWith: { everyone: false, teams: [], teamCount: 0, userCount: 0 },
      lastRun: null,
      runsThisWeek: 0,
      approvalsWaiting: 0,
      trust: { score: null, runs: 0 },
      needsAttention: [],
      canEdit: true,
      canDelete: true,
      pausedAt: null,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      channels: [],
      draft: {
        definition: draftFrom?.draft.definition ?? createEmptyAgentDefinition(GPT.modelKey),
        revision: 1,
        updatedAt: NOW,
        updatedBy: MAYA,
      },
    }
  }
  const transition = (
    action: 'pause' | 'resume' | 'archive' | 'restore',
    next: (agent: AgentDetailDto) => Partial<AgentDetailDto> | null,
  ) =>
    defineMockHandler({
      method: 'post',
      path: `${path}/:agentId/${action}`,
      response: okResponse(agentDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = store.find(params.agentId)
          if (!found) return notFound()
          const change = next(found)
          if (!change) return invalid()
          const updated = { ...found, ...change, updatedAt: NOW }
          store.save(updated)
          return mockOk(toListAgent(updated))
        },
      },
    })

  return [
    defineMockHandler({
      method: 'get',
      path,
      response: pageResponse(agentDtoSchema),
      scenarios: {
        default: ({ request }) => {
          const url = new URL(request.url)
          const q = url.searchParams.get('q')?.toLowerCase()
          const statuses = url.searchParams.getAll('status')
          const ownerId = url.searchParams.get('ownerId')
          const sort = url.searchParams.get('sort') ?? '-lastRunAt'
          const items = store
            .all()
            .map(toListAgent)
            .filter((agent) =>
              (statuses.length > 0 ? statuses : ['draft', 'active', 'paused']).includes(
                agent.status,
              ),
            )
            .filter((agent) => !q || agent.name.toLowerCase().includes(q))
            .filter(
              (agent) =>
                url.searchParams.get('needsAttention') !== 'true' ||
                agent.needsAttention.length > 0,
            )
            .filter(
              (agent) => url.searchParams.get('mine') !== 'true' || agent.owner?.id === MAYA.id,
            )
            .filter((agent) => !ownerId || agent.owner?.id === ownerId)
            .sort((a, b) => {
              const compare = BY[sort.replace('-', '')] ?? byLastRun
              return (sort.startsWith('-') ? -1 : 1) * compare(a, b)
            })
          const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
          const start = Number(url.searchParams.get('cursor') ?? 0)
          const next = start + limit < items.length ? String(start + limit) : null
          return mockPage(items.slice(start, start + limit), next)
        },
        empty: () => mockPage([]),
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/templates`,
      response: okResponse(agentTemplateListDtoSchema),
      scenarios: { default: () => mockOk({ items: AGENT_TEMPLATES }) },
    }),
    defineMockHandler({
      method: 'post',
      path,
      response: okResponse(agentDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          const input = createAgentInputSchema.parse(await request.json())
          const template = AGENT_TEMPLATES.find(({ key }) => key === input.templateKey)
          const agent = newAgent(input.name)
          const modelKey = input.modelKey ?? template?.suggestedModel?.modelKey ?? GPT.modelKey
          const draft = {
            ...agent.draft,
            definition: template
              ? { ...template.definition, model: createEmptyAgentDefinition(modelKey).model }
              : createEmptyAgentDefinition(modelKey),
          }
          const added = {
            ...agent,
            description: input.description ?? null,
            templateKey: input.templateKey ?? null,
            draft,
          }
          store.add(added)
          return mockOk(toListAgent(added))
        },
        'limit-reached': () =>
          mockError(
            HTTP_FORBIDDEN,
            ERROR_CODES.LIMIT_REACHED,
            "You've reached 10 agents on the Pro plan",
          ),
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/:agentId/duplicate`,
      response: okResponse(agentDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const found = store.find(params.agentId)
          if (!found) return notFound()
          const input = duplicateAgentInputSchema.parse(await request.json())
          const copy = newAgent(input.name ?? `${found.name} (copy)`, found)
          store.add(copy)
          return mockOk(toListAgent(copy))
        },
      },
    }),
    transition('pause', (agent) =>
      agent.status === 'active' ? { status: 'paused', pausedAt: NOW } : null,
    ),
    transition('resume', (agent) =>
      agent.status === 'paused' ? { status: 'active', pausedAt: null } : null,
    ),
    transition('archive', (agent) =>
      agent.status === 'archived' ? null : { status: 'archived', archivedAt: NOW },
    ),
    transition('restore', (agent) =>
      agent.status === 'archived'
        ? { status: agent.liveVersion === null ? 'draft' : 'paused', archivedAt: null }
        : null,
    ),
    defineMockHandler({
      method: 'get',
      path: `${path}/:agentId/impact`,
      response: okResponse(agentImpactDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = store.find(params.agentId)
          if (!found) return notFound()
          const runCount = runCountOf(found.id)
          return mockOk({
            sharedWith: found.sharedWith,
            activeChannels: found.channels
              .filter(({ status }) => status === 'active')
              .map(({ id, type }) => ({ id, type })),
            runCount,
            pendingApprovals: found.approvalsWaiting,
            deleteRequiresConfirmation: found.liveVersion !== null || runCount > 0,
          })
        },
      },
    }),
    defineMockHandler({
      method: 'delete',
      path: `${path}/:agentId`,
      response: okResponse(z.null()),
      scenarios: {
        default: ({ params, request }) => {
          const found = store.find(params.agentId)
          if (!found) return notFound()
          const url = new URL(request.url)
          const needsName = found.liveVersion !== null || runCountOf(found.id) > 0
          if (needsName && url.searchParams.get('confirmName') !== found.name) {
            return mockError(
              HTTP_CONFLICT,
              ERROR_CODES.AGENT_STATE_INVALID,
              'Type the name to confirm',
            )
          }
          store.remove(found.id)
          return new Response(null, { status: 204 })
        },
      },
    }),
  ]
}
