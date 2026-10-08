// SPDX-License-Identifier: AGPL-3.0-only
import { teamMembers, teams } from '@/database/tables/index.js'
import {
  agentDetailDtoSchema,
  createEmptyAgentDefinition,
  publishAgentResultDtoSchema,
} from '@surefy/contracts'
import type { AgentDefinition, AgentDetailDto, PublishAgentInput } from '@surefy/contracts'

import { addMember, type TestMember } from '../../../../test/factories/index.js'
import { authHeaders } from '../../../../test/helpers/auth.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, request } from '../../../../test/helpers/request.js'
import { enableProxyModel } from '../../chats/__tests__/chatsTestKit.js'

import type { TestAppOptions } from '../../../../test/helpers/testApp.js'

export const agentsUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}/agents${path}`

export type Who = 'olivia' | 'adam' | 'uma' | 'bella' | 'ben'

export interface AgentsSetup extends TwoOrgSetup {
  /** Two Builders of A: Bella and Ben. */
  builders: { bella: TestMember; ben: TestMember }
  /** The key of the model every member of A may use. */
  modelKey: string
  /** One request as one of A's people to A's agents. */
  call: (
    who: Who,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    payload?: unknown,
    query?: Record<string, string>,
  ) => ReturnType<typeof request>
  /** Creates an agent of A as `who`, from scratch, with instructions; returns it. */
  create: (
    who?: Who,
    overrides?: { name?: string; instructions?: string },
  ) => Promise<AgentDetailDto>
  /** Saves a definition as the draft; returns the new revision. */
  saveDraft: (
    who: Who,
    agent: { id: string },
    baseRevision: number,
    definition: AgentDefinition,
  ) => Promise<number>
  /** Publishes as `who`; returns the result. */
  publish: (
    who: Who,
    agentId: string,
    input: PublishAgentInput,
  ) => Promise<ReturnType<typeof publishAgentResultDtoSchema.parse>>
  /** A team of A with the given members. */
  addTeam: (name: string, members: readonly TestMember[]) => Promise<string>
  /** Limits the model to the given teams and people (Admin Adam in the Vault). */
  restrictModel: (rules: readonly ModelRule[]) => Promise<void>
}

export type ModelRule =
  { subjectType: 'team'; teamId: string } | { subjectType: 'user'; userId: string }

/** A's Owner, Admin and User plus two Builders, all signed in, with one model for everyone. */
export async function setupAgents(options: TestAppOptions = {}): Promise<AgentsSetup> {
  const setup = await setupTwoOrgs(options)
  const modelKey = await enableProxyModel(setup)
  const bella = await addMember(setup.container, setup.a.id, 'builder')
  const ben = await addMember(setup.container, setup.a.id, 'builder')
  const headers = new Map([
    ['olivia', setup.sessionOf(setup.a.members.olivia)],
    ['adam', setup.sessionOf(setup.a.members.adam)],
    ['uma', setup.sessionOf(setup.a.members.uma)],
    ['bella', await authHeaders(setup.app, bella)],
    ['ben', await authHeaders(setup.app, ben)],
  ])
  const headersOf = (who: Who) => {
    const found = headers.get(who)
    if (found === undefined) throw new Error(`unknown member ${who}`)
    return found
  }
  const call: AgentsSetup['call'] = (who, method, path, payload, query) =>
    request(setup.app, method, agentsUrl(setup.a.id, path), {
      headers: headersOf(who),
      ...(payload === undefined ? {} : { payload }),
      ...(query === undefined ? {} : { query }),
    })
  const create: AgentsSetup['create'] = async (who = 'bella', overrides = {}) => {
    const created = expectData(
      await call(who, 'POST', '', { name: overrides.name ?? 'Support agent', modelKey }),
      201,
      agentDetailDtoSchema,
    )
    const definition: AgentDefinition = {
      ...createEmptyAgentDefinition(modelKey),
      instructions: overrides.instructions ?? 'Answer questions about orders.',
    }
    const revision = await saveDraftAs(who, created.id, created.draft.revision, definition)
    return { ...created, draft: { ...created.draft, definition, revision } }
  }
  const saveDraftAs = async (
    who: Who,
    agentId: string,
    baseRevision: number,
    definition: AgentDefinition,
  ): Promise<number> => {
    const response = await call(who, 'PUT', `/${agentId}/draft`, { baseRevision, definition })
    if (response.statusCode !== 200) throw new Error(`draft: ${response.body}`)
    return response.json<{ data: { revision: number } }>().data.revision
  }
  return Object.assign(setup, {
    builders: { bella, ben },
    modelKey,
    call,
    create,
    saveDraft: (
      who: Who,
      agent: { id: string },
      baseRevision: number,
      definition: AgentDefinition,
    ) => saveDraftAs(who, agent.id, baseRevision, definition),
    publish: async (who: Who, agentId: string, input: PublishAgentInput) =>
      expectData(
        await call(who, 'POST', `/${agentId}/publish`, input),
        200,
        publishAgentResultDtoSchema,
      ),
    restrictModel: async (rules: readonly ModelRule[]) => {
      const vault = `/api/v1/orgs/${setup.a.id}/vault`
      const { data } = (
        await request(setup.app, 'GET', `${vault}/models`, {
          headers: headersOf('adam'),
          query: { providerKey: 'openai_compatible' },
        })
      ).json<{ data: { id: string; modelKey: string }[] }>()
      const model = data.find((candidate) => candidate.modelKey === modelKey)
      if (model === undefined) throw new Error('the model is listed')
      const response = await request(setup.app, 'PUT', `${vault}/models/${model.id}/access`, {
        headers: headersOf('adam'),
        payload: { rules },
      })
      if (response.statusCode !== 200) throw new Error(`model access: ${response.body}`)
    },
    addTeam: async (name: string, members: readonly TestMember[]) =>
      setup.db.tenant(setup.a.id, async (tx) => {
        const [team] = await tx
          .insert(teams)
          .values({ organizationId: setup.a.id, name })
          .returning({ id: teams.id })
        if (team === undefined) throw new Error('team seed failed')
        for (const member of members) {
          await tx
            .insert(teamMembers)
            .values({ organizationId: setup.a.id, teamId: team.id, userId: member.id })
        }
        return team.id
      }),
  })
}
