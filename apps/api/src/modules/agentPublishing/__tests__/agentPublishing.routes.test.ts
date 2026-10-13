// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { agentChannels, agentRuns } from '@/database/tables/index.js'
import {
  agentDetailDtoSchema,
  publicRunDtoSchema,
  AGENT_RUNS_ERROR_CODES,
  AGENTS_ERROR_CODES,
  ERROR_CODES,
} from '@surefy/contracts'

import { seedApiKey } from '../../../../test/factories/index.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'
import { setupAgents, type AgentsSetup } from '../../agents/__tests__/agentsTestKit.js'

/** Polls until the check finds something: the request under test runs concurrently. */
async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = await check()
    if (found !== undefined) return found
    if (Date.now() > deadline) throw new Error('waited too long')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

const url = (setup: AgentsSetup, path: string) => `/api/v1/orgs/${setup.a.id}${path}`

/** An agent of Bella's, published by Adam with the API channel on. */
async function publishedOverApi(setup: AgentsSetup) {
  const agent = await setup.create('bella')
  await setup.publish('adam', agent.id, {
    baseRevision: agent.draft.revision,
    channels: [{ type: 'api' }],
    notes: 'API',
  })
  return agent
}

const startRun = (
  setup: AgentsSetup,
  headers: Record<string, string>,
  agentId: string,
  payload: unknown = { input: 'Where is order 1182?' },
  query?: Record<string, string>,
) =>
  request(setup.app, 'POST', url(setup, `/agents/${agentId}/runs`), {
    headers,
    payload,
    ...(query === undefined ? {} : { query }),
  })

describe('publishing to the API channel', () => {
  it('turns the SurefyOS chat channel on, and the API channel for an Admin', async () => {
    const setup = await setupAgents()
    const agent = await publishedOverApi(setup)

    const detail = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    expect(
      detail.channels
        .map((channel) => [channel.type, channel.status])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    ).toEqual([
      ['api', 'active'],
      ['workspace_chat', 'active'],
    ])
    expect(detail.channels.find((channel) => channel.type === 'api')?.config.api).toEqual({
      rateLimitPerMinute: 60,
    })
  })

  it('makes a Builder’s API channel a request that waits for an Admin', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const result = await setup.publish('bella', agent.id, {
      baseRevision: agent.draft.revision,
      channels: [{ type: 'api' }],
    })
    const api = result.channels.find((channel) => channel.type === 'api')
    expect(api).toMatchObject({ status: 'pending_approval' })
    expect(api?.approvalId).not.toBeNull()
    expect(result.agent.approvalsWaiting).toBe(1)
  })
})

describe('starting a run with an API key', () => {
  it('answers 202 with the run and where to read it', async () => {
    const setup = await setupAgents()
    const agent = await publishedOverApi(setup)
    const key = await seedApiKey(setup.container, setup.a.id)

    const response = await startRun(setup, key.headers, agent.id, {
      input: 'Where is order 1182?',
      metadata: { ticket: 'T-1182' },
    })
    const run = expectData(response, 202, publicRunDtoSchema)
    expect(response.headers.location).toBe(url(setup, `/runs/${run.id}`))
    expect(run).toMatchObject({
      agentId: agent.id,
      status: 'queued',
      output: null,
      waitingForApproval: false,
      metadata: { ticket: 'T-1182' },
    })

    const [row] = await setup.db.system('test', (tx) =>
      tx.select().from(agentRuns).where(eq(agentRuns.id, run.id)),
    )
    const [channel] = await setup.db.system('test', (tx) =>
      tx.select().from(agentChannels).where(eq(agentChannels.agentId, agent.id)),
    )
    expect(row).toMatchObject({
      trigger: 'api',
      isTest: false,
      startedByUserId: null,
      apiKeyId: key.id,
      status: 'queued',
    })
    expect(row?.agentVersionId).not.toBeNull()
    expect(row?.channelId).not.toBeNull()
    expect(channel?.type === 'api' || channel?.type === 'workspace_chat').toBe(true)
  })

  it('returns the first run for a repeated Idempotency-Key, and refuses another body', async () => {
    const setup = await setupAgents()
    const agent = await publishedOverApi(setup)
    const key = await seedApiKey(setup.container, setup.a.id)
    const headers = { ...key.headers, 'idempotency-key': 'order-1182' }

    const first = expectData(await startRun(setup, headers, agent.id), 202, publicRunDtoSchema)
    const again = expectData(await startRun(setup, headers, agent.id), 202, publicRunDtoSchema)
    expect(again.id).toBe(first.id)
    expectError(
      await startRun(setup, headers, agent.id, { input: 'Something else' }),
      409,
      ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    )
    const rows = await setup.db.system('test', (tx) =>
      tx.select().from(agentRuns).where(eq(agentRuns.agentId, agent.id)),
    )
    expect(rows).toHaveLength(1)
  })

  it('does not store a failed call under its Idempotency-Key', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const key = await seedApiKey(setup.container, setup.a.id)
    const headers = { ...key.headers, 'idempotency-key': 'retry-me' }

    expectError(
      await startRun(setup, headers, agent.id),
      409,
      AGENTS_ERROR_CODES.AGENT_NOT_PUBLISHED,
    )
    await setup.publish('adam', agent.id, {
      baseRevision: agent.draft.revision,
      channels: [{ type: 'api' }],
    })
    expectData(await startRun(setup, headers, agent.id), 202, publicRunDtoSchema)
  })

  it('needs a published agent with an active API channel', async () => {
    const setup = await setupAgents()
    const key = await seedApiKey(setup.container, setup.a.id)

    const draft = await setup.create('bella')
    expectError(
      await startRun(setup, key.headers, draft.id),
      409,
      AGENTS_ERROR_CODES.AGENT_NOT_PUBLISHED,
    )

    const chatOnly = await setup.create('bella')
    await setup.publish('bella', chatOnly.id, {
      baseRevision: chatOnly.draft.revision,
      channels: [],
    })
    expectError(
      await startRun(setup, key.headers, chatOnly.id),
      409,
      AGENTS_ERROR_CODES.AGENT_NOT_PUBLISHED,
    )

    const live = await publishedOverApi(setup)
    expectData(
      await setup.call('bella', 'POST', `/${live.id}/pause`),
      200,
      agentDetailDtoSchema.partial(),
    )
    expectError(await startRun(setup, key.headers, live.id), 409, AGENTS_ERROR_CODES.AGENT_PAUSED)

    expectError(
      await startRun(setup, key.headers, '0198f2c0-0000-7000-8000-000000000000'),
      404,
      AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
    )
  })

  it('is for API keys of the organization with the agents:invoke scope', async () => {
    const setup = await setupAgents()
    const agent = await publishedOverApi(setup)

    // a signed-in person starts runs from Chat or the Test tab
    expectError(
      await startRun(setup, setup.sessionOf(setup.a.members.olivia), agent.id),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    const readOnly = await seedApiKey(setup.container, setup.a.id, { scopes: ['agents:read'] })
    expectError(
      await startRun(setup, readOnly.headers, agent.id),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    // the other organization's key does not reach this organization
    const ofB = await seedApiKey(setup.container, setup.b.id)
    expectError(
      await startRun(setup, ofB.headers, agent.id),
      404,
      ERROR_CODES.ORGANIZATION_NOT_FOUND,
    )
  })

  it('limits the calls a minute to the channel’s rate', async () => {
    const setup = await setupAgents()
    const agent = await publishedOverApi(setup)
    const key = await seedApiKey(setup.container, setup.a.id)
    await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .update(agentChannels)
        .set({ config: { version: 1, api: { rateLimitPerMinute: 1 } } })
        .where(eq(agentChannels.type, 'api')),
    )

    expectData(await startRun(setup, key.headers, agent.id), 202, publicRunDtoSchema)
    expectError(await startRun(setup, key.headers, agent.id), 429, ERROR_CODES.RATE_LIMITED)
  })
})

describe('reading and canceling a run with an API key', () => {
  it('shows a key only the runs it started', async () => {
    const setup = await setupAgents()
    const agent = await publishedOverApi(setup)
    const key = await seedApiKey(setup.container, setup.a.id)
    const other = await seedApiKey(setup.container, setup.a.id)
    const run = expectData(await startRun(setup, key.headers, agent.id), 202, publicRunDtoSchema)

    const read = (headers: Record<string, string>, path = '') =>
      request(setup.app, 'GET', url(setup, `/runs/${run.id}${path}`), { headers })
    expect(expectData(await read(key.headers), 200, publicRunDtoSchema).id).toBe(run.id)
    expectError(await read(other.headers), 404, AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_FOUND)
    // the step trace is for people who can edit the agent
    expectError(await read(key.headers, '/steps'), 403, ERROR_CODES.ACCESS_FORBIDDEN)

    expectError(
      await request(setup.app, 'POST', url(setup, `/runs/${run.id}/cancel`), {
        headers: other.headers,
      }),
      404,
      AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_FOUND,
    )
    const canceled = expectData(
      await request(setup.app, 'POST', url(setup, `/runs/${run.id}/cancel`), {
        headers: key.headers,
      }),
      200,
      publicRunDtoSchema,
    )
    expect(canceled.status).toBe('canceled')
    expect(canceled.finishedAt).not.toBeNull()
  })

  it('streams the events of a run that has ended, closing after the last one', async () => {
    const setup = await setupAgents()
    const agent = await publishedOverApi(setup)
    const key = await seedApiKey(setup.container, setup.a.id)
    const run = expectData(await startRun(setup, key.headers, agent.id), 202, publicRunDtoSchema)
    await request(setup.app, 'POST', url(setup, `/runs/${run.id}/cancel`), { headers: key.headers })

    const response = await request(setup.app, 'GET', url(setup, `/runs/${run.id}/events`), {
      headers: key.headers,
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.headers['x-vercel-ai-ui-message-stream']).toBe('v1')
    const events = response.body
      .split('\n\n')
      .filter((frame) => frame.startsWith('data: ') || frame.includes('\ndata: '))
      .map((frame) => frame.slice(frame.indexOf('data: ') + 6))
    expect(events.at(-1)).toBe('[DONE]')
    const types = events.slice(0, -1).map((event) => (JSON.parse(event) as { type: string }).type)
    expect(types[0]).toBe('start')
    expect(types).toContain('data-step')
    expect(types.at(-1)).toBe('finish')

    // streaming right from the start: the response is the event stream, not the run
    const streaming = startRun(setup, key.headers, agent.id, { input: 'Again' }, { stream: 'true' })
    const started = await waitFor(async () => {
      const rows = await setup.db.system('test', (tx) =>
        tx.select().from(agentRuns).where(eq(agentRuns.agentId, agent.id)),
      )
      return rows.find((row) => row.id !== run.id)
    })
    await request(setup.app, 'POST', url(setup, `/runs/${started.id}/cancel`), {
      headers: key.headers,
    })
    const streamed = await streaming
    expect(streamed.statusCode).toBe(200)
    expect(streamed.headers['content-type']).toContain('text/event-stream')
    expect(streamed.body).toContain('"type":"finish"')
  })
})
