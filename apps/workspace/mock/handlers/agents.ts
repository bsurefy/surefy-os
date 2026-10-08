// SPDX-License-Identifier: AGPL-3.0-only
import {
  agentDetailDtoSchema,
  agentDtoSchema,
  createEmptyAgentDefinition,
  ERROR_CODES,
  okResponse,
  saveAgentDraftDtoSchema,
  saveAgentDraftInputSchema,
  updateAgentInputSchema,
} from '@surefy/contracts'
import type { AgentDefinition, AgentDetailDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
} from '@surefy/web-core/testing/mock'

import { AGENT_KIND, SUPPORT_AGENT_ID } from './agentIds'
import { agentPublishingHandlers, resetAgentPublishingMock } from './agentPublishing'
import { agentListHandlers, resetAgentsListMock } from './agentsList'
import { agentToolHandlers } from './agentTools'
import { HELP_CENTER_ID, HR_POLICIES_ID } from './knowledge'
import { MAYA, OMAR } from './shell.fixtures'
import { SUPPORT_TEAM_ID } from './teams'

export {
  ARCHIVED_AGENT_ID,
  DRAFT_AGENT_ID,
  READ_ONLY_AGENT_ID,
  RETIRED_MODEL_AGENT_ID,
  SUPPORT_AGENT_ID,
} from './agentIds'

const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_SERVER_ERROR = 500
const NOW = '2026-01-15T09:00:00.000Z'

/** An active agent, live on version 1, with no draft changes, unless overridden. */
export const agentDetailFactory = defineFactory(
  agentDetailDtoSchema,
  (sequence): AgentDetailDto => ({
    id: fixtureUuid(AGENT_KIND, sequence),
    name: `Agent ${sequence}`,
    description: null,
    status: 'active',
    owner: MAYA,
    model: {
      modelKey: 'openai/gpt-4.1',
      displayName: 'GPT-4.1',
      providerKey: 'openai',
      source: 'provider',
    },
    liveVersion: 1,
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
    createdAt: '2026-01-02T09:00:00.000Z',
    updatedAt: '2026-01-14T09:00:00.000Z',
    draft: {
      definition: createEmptyAgentDefinition('openai/gpt-4.1'),
      revision: 1,
      updatedAt: '2026-01-14T09:00:00.000Z',
      updatedBy: MAYA,
    },
    channels: [],
  }),
)

const SUPPORT_LIVE_DEFINITION: AgentDefinition = {
  ...createEmptyAgentDefinition('openai/gpt-4.1'),
  instructions:
    'You answer customer questions about orders and refunds. Be brief and kind, and cite the help center.',
  tone: 'Friendly and concise',
  conversationStarters: ['Where is my order?', 'How do I get a refund?'],
  knowledge: { knowledgeBaseIds: [HELP_CENTER_ID], citeSources: true, onlyFromKnowledge: false },
}

function seedAgents(): AgentDetailDto[] {
  agentDetailFactory.reset()
  return [
    agentDetailFactory({
      name: 'Support triage',
      description: 'Answers order and refund questions from the help center.',
      liveVersion: 3,
      hasUnpublishedChanges: true,
      sharedWith: {
        everyone: false,
        teams: [{ id: SUPPORT_TEAM_ID, name: 'Support' }],
        teamCount: 1,
        userCount: 0,
      },
      draft: {
        definition: {
          ...SUPPORT_LIVE_DEFINITION,
          instructions: `${SUPPORT_LIVE_DEFINITION.instructions} Hand over to a person when a refund is above $500.`,
          model: { ...SUPPORT_LIVE_DEFINITION.model, creativity: 0.5 },
        },
        revision: 7,
        updatedAt: '2026-01-15T08:30:00.000Z',
        updatedBy: MAYA,
      },
    }),
    agentDetailFactory({
      name: 'New agent',
      status: 'draft',
      liveVersion: null,
      model: null,
      draft: {
        definition: createEmptyAgentDefinition('openai/gpt-4.1'),
        revision: 1,
        updatedAt: '2026-01-15T08:00:00.000Z',
        updatedBy: MAYA,
      },
    }),
    agentDetailFactory({
      name: 'Old invoice checker',
      status: 'archived',
      archivedAt: '2026-01-10T09:00:00.000Z',
      draft: {
        definition: { ...SUPPORT_LIVE_DEFINITION, instructions: 'Check invoices against orders.' },
        revision: 4,
        updatedAt: '2026-01-09T09:00:00.000Z',
        updatedBy: OMAR,
      },
    }),
    agentDetailFactory({
      name: 'HR helper',
      description: 'Shared with you for reading only.',
      canEdit: false,
      canDelete: false,
      owner: OMAR,
      draft: {
        definition: {
          ...SUPPORT_LIVE_DEFINITION,
          instructions: 'Answer questions about leave and benefits.',
          knowledge: {
            knowledgeBaseIds: [HR_POLICIES_ID],
            citeSources: true,
            onlyFromKnowledge: true,
          },
        },
        revision: 2,
        updatedAt: '2026-01-12T09:00:00.000Z',
        updatedBy: OMAR,
      },
    }),
    agentDetailFactory({
      name: 'Sales assistant',
      draft: {
        definition: {
          ...SUPPORT_LIVE_DEFINITION,
          model: { ...SUPPORT_LIVE_DEFINITION.model, modelKey: 'openai/retired-model' },
        },
        revision: 3,
        updatedAt: '2026-01-13T09:00:00.000Z',
        updatedBy: MAYA,
      },
    }),
  ]
}

let agents = seedAgents()
let revisionBumped = false

/** Back to the seeded agents; tests call it between cases. */
export function resetAgentsMock(): void {
  agents = seedAgents()
  revisionBumped = false
  resetAgentsListMock()
  resetAgentPublishingMock()
}

const path = '/orgs/:orgId/agents'
const find = (id: unknown) => agents.find((agent) => agent.id === id)
const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, 'Agent not found')

/** The definition of the version that is live: for "Support triage" the one the draft was changed from. */
const liveDefinitionOf = (agent: AgentDetailDto): AgentDefinition =>
  agent.id === SUPPORT_AGENT_ID ? SUPPORT_LIVE_DEFINITION : agent.draft.definition

const store = {
  find,
  all: () => agents,
  add: (agent: AgentDetailDto) => {
    agents = [...agents, agent]
  },
  remove: (id: string) => {
    agents = agents.filter((agent) => agent.id !== id)
  },
  save: (updated: AgentDetailDto) => {
    agents = agents.map((agent) => (agent.id === updated.id ? updated : agent))
  },
  liveDefinitionOf,
}

/**
 * The agent behind the editor (Agents › Editor). Four agents: "Support triage" is live on version 3
 * with unpublished changes, "New agent" was never published, "Old invoice checker" is archived and
 * "HR helper" is shared for reading only; "Sales assistant" uses a model that is no longer allowed.
 * Scenarios: on a draft save, `conflict` answers that someone else changed the draft first (the
 * agent then holds their newer revision) and `error` fails the save.
 */
export const agentsDomain = defineMockDomain('agents', [
  // before `/:agentId`, which would take `templates` for an id
  ...agentListHandlers(store),
  defineMockHandler({
    method: 'get',
    path: `${path}/:agentId`,
    response: okResponse(agentDetailDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = find(params.agentId)
        return found ? mockOk(found) : notFound()
      },
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${path}/:agentId`,
    response: okResponse(agentDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = find(params.agentId)
        if (!found) return notFound()
        const input = updateAgentInputSchema.parse(await request.json())
        const updated = {
          ...found,
          ...input,
          description: input.description === undefined ? found.description : input.description,
          updatedAt: NOW,
        }
        agents = agents.map((agent) => (agent.id === updated.id ? updated : agent))
        // the schema drops the draft and the channels, which `PATCH` does not answer with
        return mockOk(agentDtoSchema.parse(updated))
      },
    },
  }),
  defineMockHandler({
    method: 'put',
    path: `${path}/:agentId/draft`,
    response: okResponse(saveAgentDraftDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = find(params.agentId)
        if (!found) return notFound()
        if (found.status === 'archived') {
          return mockError(
            HTTP_CONFLICT,
            ERROR_CODES.AGENT_NOT_EDITABLE,
            'Archived agents are read-only',
          )
        }
        const input = saveAgentDraftInputSchema.parse(await request.json())
        if (input.baseRevision !== found.draft.revision) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.AGENT_EDIT_CONFLICT, 'The draft changed')
        }
        const draft = {
          ...found.draft,
          definition: input.definition,
          revision: found.draft.revision + 1,
          updatedAt: NOW,
          updatedBy: MAYA,
        }
        const hasUnpublishedChanges = found.liveVersion !== null
        agents = agents.map((agent) =>
          agent.id === found.id ? { ...found, draft, hasUnpublishedChanges } : agent,
        )
        return mockOk({ revision: draft.revision, updatedAt: NOW, hasUnpublishedChanges })
      },
      conflict: ({ params }) => {
        const found = find(params.agentId)
        if (!found) return notFound()
        if (!revisionBumped) {
          revisionBumped = true
          agents = agents.map((agent) =>
            agent.id === found.id
              ? {
                  ...found,
                  liveVersion: (found.liveVersion ?? 0) + 1,
                  draft: {
                    ...found.draft,
                    revision: found.draft.revision + 1,
                    updatedBy: OMAR,
                    updatedAt: NOW,
                  },
                }
              : agent,
          )
        }
        return mockError(HTTP_CONFLICT, ERROR_CODES.AGENT_EDIT_CONFLICT, 'The draft changed')
      },
      error: () =>
        mockError(HTTP_SERVER_ERROR, ERROR_CODES.INTERNAL_ERROR, 'The draft could not be saved'),
    },
  }),
  ...agentPublishingHandlers(store),
  ...agentToolHandlers(store),
])
