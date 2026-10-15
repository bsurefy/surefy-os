// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { QUEUES } from '@/constants/queues.js'
import {
  agentRuns,
  auditLogs,
  budgetAlerts,
  notifications,
  outboxEvents,
  runStatsDaily,
  usageEvents,
  vaultModels,
} from '@/database/tables/index.js'
import {
  agentDetailDtoSchema,
  insightsBudgetMeterDtoSchema,
  budgetDtoSchema,
  credentialDtoSchema,
  ERROR_CODES,
  teamDtoSchema,
  vaultModelDtoSchema,
  type CreateBudgetInput,
  type UsageEvent,
} from '@surefy/contracts'

import { testKey } from '../../../../test/fixtures/fakeAi.js'
import { authHeaders } from '../../../../test/helpers/auth.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'
import { setupAgents } from '../../agents/__tests__/agentsTestKit.js'
import { periodOf } from '../budgets.utils.js'

import type { ModelCallContext } from '@/modules/modelGateway/index.js'

const budgetsUrl = (setup: TwoOrgSetup, path = '') => `/api/v1/orgs/${setup.a.id}/budgets${path}`
const vaultUrl = (setup: TwoOrgSetup, path: string) => `/api/v1/orgs/${setup.a.id}/vault${path}`

/** 1 USD per input token: the fake provider's 12 input tokens cost 12 USD. */
const PRICE_PER_MTOK = 1_000_000_000_000

const asAdmin = (setup: TwoOrgSetup) => setup.sessionOf(setup.a.members.adam)

async function createBudget(
  setup: TwoOrgSetup,
  input: CreateBudgetInput | Record<string, unknown>,
) {
  return expectData(
    await request(setup.app, 'POST', budgetsUrl(setup), {
      headers: asAdmin(setup),
      payload: input,
    }),
    201,
    budgetDtoSchema,
  )
}

async function createTeam(setup: TwoOrgSetup, name: string, memberUserIds: string[]) {
  return expectData(
    await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/teams`, {
      headers: setup.sessionOf(setup.a.members.olivia),
      payload: { name, memberUserIds },
    }),
    201,
    teamDtoSchema,
  )
}

/** A local server with its first model enabled; returns the model key. */
async function localModel(setup: TwoOrgSetup): Promise<string> {
  const headers = asAdmin(setup)
  const server = expectData(
    await request(setup.app, 'POST', vaultUrl(setup, '/local-servers'), {
      headers,
      payload: {
        scope: 'organization',
        name: 'Office server',
        providerKey: 'ollama',
        baseUrl: 'http://ollama.lab.test:11434',
      },
    }),
    201,
    credentialDtoSchema,
  )
  const [model] = expectPage(
    await request(setup.app, 'GET', vaultUrl(setup, `/models?serverId=${server.id}`), { headers }),
    vaultModelDtoSchema,
  ).data
  if (!model) throw new Error('the server lists models')
  expectData(
    await request(setup.app, 'PATCH', vaultUrl(setup, `/models/${model.id}`), {
      headers,
      payload: { isEnabled: true },
    }),
    200,
    vaultModelDtoSchema,
  )
  return model.modelKey
}

/** An organization proxy key with its first model enabled and priced; returns the model key. */
async function cloudModel(setup: TwoOrgSetup): Promise<string> {
  const headers = asAdmin(setup)
  expectData(
    await request(setup.app, 'POST', vaultUrl(setup, '/credentials'), {
      headers,
      payload: {
        scope: 'organization',
        name: 'Proxy',
        providerKey: 'openai_compatible',
        secret: testKey('proxy-org-1111'),
        baseUrl: 'https://llm-proxy.acme.test/v1',
      },
    }),
    201,
    credentialDtoSchema,
  )
  const [model] = expectPage(
    await request(setup.app, 'GET', vaultUrl(setup, '/models?providerKey=openai_compatible'), {
      headers,
    }),
    vaultModelDtoSchema,
  ).data
  if (!model) throw new Error('the proxy lists models')
  if (!model.isEnabled) {
    expectData(
      await request(setup.app, 'PATCH', vaultUrl(setup, `/models/${model.id}`), {
        headers,
        payload: { isEnabled: true },
      }),
      200,
      vaultModelDtoSchema,
    )
  }
  await setup.db.tenant(setup.a.id, (tx) =>
    tx
      .update(vaultModels)
      .set({ inputPricePerMtokMicros: PRICE_PER_MTOK, outputPricePerMtokMicros: 0 })
      .where(eq(vaultModels.id, model.id)),
  )
  return model.modelKey
}

const setFallback = async (setup: TwoOrgSetup, order: string[]) =>
  request(setup.app, 'PUT', vaultUrl(setup, '/settings'), {
    headers: asAdmin(setup),
    payload: {
      fallback: {
        version: 1,
        order,
        onProviderError: true,
        timeoutSeconds: null,
        privateChatsLocalOnly: true,
      },
    },
  })

async function contextOf(setup: TwoOrgSetup, who: 'adam' | 'uma'): Promise<ModelCallContext> {
  const member = setup.a.members[who]
  const access = await setup.container.modules.access.service.forMember(setup.a.id, member.id)
  if (access === null) throw new Error('member has access')
  return {
    orgId: setup.a.id,
    userId: member.id,
    teamIds: access.teamIds,
    primaryTeamId: access.primaryTeamId,
    allowedModelIds: access.allowedModelIds,
    caller: 'chat',
  }
}

const gatewayOf = (setup: TwoOrgSetup) => setup.container.modules.modelGateway.service

let seq = 0
const usageEvent = (over: Partial<UsageEvent>): UsageEvent => ({
  userId: null,
  teamId: null,
  apiKeyId: null,
  sourceModule: 'chat',
  subjectType: null,
  subjectId: null,
  sourceRefId: null,
  kind: 'generation',
  modelKey: 'openai/gpt-test',
  vaultModelId: null,
  credentialId: null,
  credentialScope: 'organization',
  providerKey: 'openai',
  inputTokens: 100,
  outputTokens: 50,
  cachedInputTokens: 0,
  reasoningTokens: 0,
  units: 0,
  costMicros: 1000,
  currency: 'USD',
  billedVia: 'provider_direct',
  latencyMs: 300,
  outcome: 'success',
  errorCode: null,
  routed: false,
  fallbackFromModelKey: null,
  piiMasked: false,
  dataLocation: 'provider',
  dedupeKey: `chat:budget-${++seq}:0`,
  requestId: null,
  occurredAt: new Date().toISOString(),
  ...over,
})

/** Meters a committed call the way the gateway's recorder does, counters included. */
async function spend(setup: TwoOrgSetup, event: UsageEvent) {
  const { usage } = setup.container.modules
  const inserted = await setup.db.tenant(setup.a.id, (tx) =>
    usage.meter.recordInTx(tx, setup.a.id, event),
  )
  if (inserted) await usage.budgets.recorded(setup.a.id, event)
}

const alertJobs = async (setup: TwoOrgSetup) =>
  (await setup.container.queues.get(QUEUES.USAGE).getJobs(['waiting', 'delayed']))
    .filter((job) => job.name === 'budgetAlert')
    .map((job) => job.id)

describe('budgets', () => {
  it('creates, lists, changes and deletes budgets, each audited and announced', async () => {
    const setup = await setupTwoOrgs()
    const { uma } = setup.a.members
    const support = await createTeam(setup, 'Support', [uma.id])
    const organization = await createBudget(setup, {
      scope: 'organization',
      amountMicros: 1_000_000_000,
      onReached: 'switch_to_local',
    })
    expect(organization).toMatchObject({
      scope: 'organization',
      currency: 'USD',
      alertThresholdsBp: [5000, 8000, 10_000],
      isEnabled: true,
      meter: { spentMicros: 0, effectiveAmountMicros: 1_000_000_000, state: 'ok' },
      updatedBy: { id: setup.a.members.adam.id },
    })
    const team = await createBudget(setup, {
      scope: 'team',
      teamId: support.id,
      amountMicros: 400_000_000,
      alertThresholdsBp: [9000, 5000],
    })
    expect(team).toMatchObject({ team: { id: support.id }, alertThresholdsBp: [5000, 9000] })
    const personal = await createBudget(setup, {
      scope: 'user',
      userId: uma.id,
      amountMicros: 100_000_000,
      onReached: 'pause_cloud_models',
    })
    expect(personal).toMatchObject({ user: { id: uma.id }, primaryTeam: { id: support.id } })

    const page = expectPage(
      await request(setup.app, 'GET', budgetsUrl(setup), { headers: asAdmin(setup) }),
      budgetDtoSchema,
    )
    expect(page.data.map((budget) => budget.scope)).toEqual(['organization', 'team', 'user'])
    const people = expectPage(
      await request(setup.app, 'GET', budgetsUrl(setup, '?scope=user'), {
        headers: asAdmin(setup),
      }),
      budgetDtoSchema,
    )
    expect(people.data.map((budget) => budget.id)).toEqual([personal.id])

    // lowering the organization budget leaves the team's own amount, the minimum applies
    const lowered = expectData(
      await request(setup.app, 'PATCH', budgetsUrl(setup, `/${organization.id}`), {
        headers: asAdmin(setup),
        payload: { amountMicros: 300_000_000 },
      }),
      200,
      budgetDtoSchema,
    )
    expect(lowered.amountMicros).toBe(300_000_000)
    const teams = expectPage(
      await request(setup.app, 'GET', budgetsUrl(setup, '?scope=team'), {
        headers: asAdmin(setup),
      }),
      budgetDtoSchema,
    )
    expect(teams.data[0]).toMatchObject({
      amountMicros: 400_000_000,
      meter: { amountMicros: 400_000_000, effectiveAmountMicros: 300_000_000 },
    })

    expect(
      (
        await request(setup.app, 'DELETE', budgetsUrl(setup, `/${personal.id}`), {
          headers: asAdmin(setup),
        })
      ).statusCode,
    ).toBe(204)
    expectError(
      await request(setup.app, 'DELETE', budgetsUrl(setup, `/${personal.id}`), {
        headers: asAdmin(setup),
      }),
      404,
      ERROR_CODES.BUDGET_NOT_FOUND,
    )

    const { audits, events } = await setup.db.system('test', async (tx) => ({
      audits: await tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(
          and(eq(auditLogs.organizationId, setup.a.id), sql`${auditLogs.action} like 'budget.%'`),
        ),
      events: await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, setup.a.id),
            eq(outboxEvents.topic, 'budgets.changed'),
          ),
        ),
    }))
    expect(audits.map((entry) => entry.action).sort((x, y) => x.localeCompare(y))).toEqual([
      'budget.created',
      'budget.created',
      'budget.created',
      'budget.deleted',
      'budget.updated',
    ])
    expect(events).toHaveLength(5)
  })

  it('refuses a second budget, a missing target and a child above the organization budget', async () => {
    const setup = await setupTwoOrgs()
    const support = await createTeam(setup, 'Support', [setup.a.members.uma.id])
    await createBudget(setup, { scope: 'organization', amountMicros: 100 })
    expectError(
      await request(setup.app, 'POST', budgetsUrl(setup), {
        headers: asAdmin(setup),
        payload: { scope: 'organization', amountMicros: 50 },
      }),
      409,
      ERROR_CODES.BUDGET_ALREADY_EXISTS,
    )
    const above = expectError(
      await request(setup.app, 'POST', budgetsUrl(setup), {
        headers: asAdmin(setup),
        payload: { scope: 'team', teamId: support.id, amountMicros: 101 },
      }),
      422,
      ERROR_CODES.ACCESS_EXCEEDS_PARENT,
    )
    expect(above.details).toEqual([
      { field: 'amountMicros', parentValue: 100, parentSource: 'organization' },
    ])
    expectError(
      await request(setup.app, 'POST', budgetsUrl(setup), {
        headers: asAdmin(setup),
        payload: { scope: 'user', userId: setup.b.members.bea.id, amountMicros: 10 },
      }),
      422,
      ERROR_CODES.BUDGET_TARGET_NOT_FOUND,
    )
    const team = await createBudget(setup, { scope: 'team', teamId: support.id, amountMicros: 80 })
    expectError(
      await request(setup.app, 'PATCH', budgetsUrl(setup, `/${team.id}`), {
        headers: asAdmin(setup),
        payload: { amountMicros: 120 },
      }),
      422,
      ERROR_CODES.ACCESS_EXCEEDS_PARENT,
    )
    expectError(
      await request(setup.app, 'POST', budgetsUrl(setup), {
        headers: asAdmin(setup),
        payload: { scope: 'organization', amountMicros: -1 },
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('lets Builders and up read budgets and only Admins change them', async () => {
    const setup = await setupTwoOrgs()
    const budget = await createBudget(setup, { scope: 'organization', amountMicros: 100 })
    const asUser = setup.sessionOf(setup.a.members.uma)
    expectError(
      await request(setup.app, 'GET', budgetsUrl(setup), { headers: asUser }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await request(setup.app, 'PATCH', budgetsUrl(setup, `/${budget.id}`), {
        headers: asUser,
        payload: { amountMicros: 1 },
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })
})

describe('budget enforcement in the model gateway', () => {
  it('pauses cloud models once a budget is reached and keeps local models working', async () => {
    const setup = await setupTwoOrgs()
    const local = await localModel(setup)
    const cloud = await cloudModel(setup)
    await createBudget(setup, {
      scope: 'organization',
      amountMicros: 0,
      onReached: 'pause_cloud_models',
    })
    const ctx = await contextOf(setup, 'uma')
    const error: unknown = await gatewayOf(setup)
      .generateText(ctx, { modelKey: cloud, prompt: 'Hi' })
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({
      code: ERROR_CODES.BUDGET_EXCEEDED,
      statusCode: 429,
      options: {
        details: [
          {
            scope: 'organization',
            amountMicros: 0,
            currency: 'USD',
            periodEnd: periodOf(new Date()).periodEnd,
          },
        ],
      },
    })
    const answer = await gatewayOf(setup).generateText(ctx, { modelKey: local, prompt: 'Hi' })
    expect(answer.call.credentialScope).toBe('local')
    const outcomes = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select({ outcome: usageEvents.outcome, modelKey: usageEvents.modelKey }).from(usageEvents),
    )
    expect(outcomes).toEqual(
      expect.arrayContaining([
        { outcome: 'blocked', modelKey: cloud },
        { outcome: 'success', modelKey: local },
      ]),
    )
  })

  it('switches to the first local model in the fallback order, and refuses without one', async () => {
    const setup = await setupTwoOrgs()
    const cloud = await cloudModel(setup)
    await createBudget(setup, {
      scope: 'organization',
      amountMicros: 0,
      onReached: 'switch_to_local',
    })
    const ctx = await contextOf(setup, 'uma')
    await expect(
      gatewayOf(setup).generateText(ctx, { modelKey: cloud, prompt: 'Hi' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.BUDGET_EXCEEDED })

    const local = await localModel(setup)
    await setFallback(setup, [cloud, local])
    const answer = await gatewayOf(setup).generateText(await contextOf(setup, 'uma'), {
      modelKey: cloud,
      prompt: 'Hi',
    })
    expect(answer.call).toMatchObject({
      model: { modelKey: local },
      credentialScope: 'local',
      fallback: { from: { modelKey: cloud }, to: { modelKey: local }, reason: 'budget' },
    })
    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .select({ fallbackFromModelKey: usageEvents.fallbackFromModelKey })
        .from(usageEvents)
        .where(eq(usageEvents.modelKey, local)),
    )
    expect(row?.fallbackFromModelKey).toBe(cloud)
  })

  it('applies a personal limit and the primary team budget only to the people they cover', async () => {
    const setup = await setupTwoOrgs()
    const { adam, uma } = setup.a.members
    const cloud = await cloudModel(setup)
    const support = await createTeam(setup, 'Support', [uma.id])
    await createBudget(setup, {
      scope: 'user',
      userId: uma.id,
      amountMicros: 0,
      onReached: 'pause_cloud_models',
    })
    await expect(
      gatewayOf(setup).generateText(await contextOf(setup, 'uma'), {
        modelKey: cloud,
        prompt: 'Hi',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.BUDGET_EXCEEDED })
    const adams = await gatewayOf(setup).generateText(await contextOf(setup, 'adam'), {
      modelKey: cloud,
      prompt: 'Hi',
    })
    expect(adams.call.outcome).toBe('success')

    // adam joins Support, his primary team: its reached budget stops him too
    await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/teams/${support.id}/members`, {
      headers: setup.sessionOf(setup.a.members.olivia),
      payload: { userIds: [adam.id] },
    })
    await createBudget(setup, {
      scope: 'team',
      teamId: support.id,
      amountMicros: 0,
      onReached: 'pause_cloud_models',
    })
    await expect(
      gatewayOf(setup).generateText(await contextOf(setup, 'adam'), {
        modelKey: cloud,
        prompt: 'Hi',
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.BUDGET_EXCEEDED,
      options: { details: [{ scope: 'team' }] },
    })
  })

  it('lets calls through when the reached budget only notifies, and counts their cost', async () => {
    const setup = await setupTwoOrgs()
    const cloud = await cloudModel(setup)
    const budget = await createBudget(setup, { scope: 'organization', amountMicros: 20_000_000 })
    const ctx = await contextOf(setup, 'uma')
    // seed the counter, then spend 12 USD past 50%: one alert job
    await gatewayOf(setup).generateText(ctx, { modelKey: cloud, prompt: 'Hi' })
    expect(await alertJobs(setup)).toEqual([
      `budget-${budget.id}-${periodOf(new Date()).periodStart.slice(0, 7).replace('-', '')}-5000`,
    ])
    // 24 USD: past 80% and 100%, and the call still went through
    const second = await gatewayOf(setup).generateText(ctx, { modelKey: cloud, prompt: 'Hi' })
    expect(second.call.outcome).toBe('success')
    expect(await alertJobs(setup)).toHaveLength(3)
    const [listed] = expectPage(
      await request(setup.app, 'GET', budgetsUrl(setup), { headers: asAdmin(setup) }),
      budgetDtoSchema,
    ).data
    expect(listed?.meter).toMatchObject({
      spentMicros: 24_000_000,
      usedBp: 12_000,
      state: 'reached',
    })
  })
})

describe('budget alerts', () => {
  it('fires each threshold once and notifies the Admins, Owners and the person', async () => {
    const setup = await setupTwoOrgs()
    const { olivia, adam, uma } = setup.a.members
    const budget = await createBudget(setup, { scope: 'user', userId: uma.id, amountMicros: 1000 })
    const { usage, outbox } = setup.container.modules
    const payload = {
      orgId: setup.a.id,
      budgetId: budget.id,
      periodStart: periodOf(new Date()).periodStart,
      thresholdBp: 8000,
      spentMicros: 850,
    }
    expect(await usage.budgetAlerts.fire(payload)).toBe(true)
    expect(await usage.budgetAlerts.fire(payload)).toBe(false)
    // a threshold the budget does not have
    expect(await usage.budgetAlerts.fire({ ...payload, thresholdBp: 7000 })).toBe(false)
    // deliver the event the relay would hand the worker, twice: at least once
    const [event] = await setup.db.system('test', (tx) =>
      tx.select().from(outboxEvents).where(eq(outboxEvents.topic, 'budget.threshold_reached')),
    )
    if (event === undefined) throw new Error('the alert emits an event')
    const delivery = {
      eventId: event.id,
      orgId: setup.a.id,
      topic: event.topic,
      payload: event.payload,
    }
    await outbox.service.deliver(delivery)
    await outbox.service.deliver(delivery)
    const sent = await setup.db.system('test', (tx) =>
      tx
        .select({ userId: notifications.userId, params: notifications.params })
        .from(notifications)
        .where(eq(notifications.type, 'budget.threshold_reached')),
    )
    const byId = (x: string, y: string) => x.localeCompare(y)
    expect(sent.map((row) => row.userId).sort(byId)).toEqual(
      [olivia.id, adam.id, uma.id].sort(byId),
    )
    expect(sent[0]?.params).toMatchObject({
      version: 1,
      scope: 'user',
      scopeLabel: uma.name,
      thresholdBp: 8000,
      spentMicros: 850,
      amountMicros: 1000,
      currency: 'USD',
      onReached: 'notify_only',
    })
    const [listed] = expectPage(
      await request(setup.app, 'GET', budgetsUrl(setup), { headers: asAdmin(setup) }),
      budgetDtoSchema,
    ).data
    expect(listed?.lastAlert).toMatchObject({ thresholdBp: 8000 })
  })

  it('reconciles counters and missed alerts from the hourly rollup', async () => {
    const setup = await setupTwoOrgs()
    const { usage, outbox } = setup.container.modules
    const budget = await createBudget(setup, { scope: 'organization', amountMicros: 10_000 })
    // the counter exists (the list seeded it) but misses an increment: the row is written
    // without moving it, as after a crash between commit and INCRBY
    await setup.db.tenant(setup.a.id, (tx) =>
      usage.meter.recordInTx(tx, setup.a.id, usageEvent({ costMicros: 9_000 })),
    )
    await spend(setup, usageEvent({ costMicros: 100 }))
    await usage.rollup.aggregate('hourly')
    const alerts = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select({ thresholdBp: budgetAlerts.thresholdBp }).from(budgetAlerts),
    )
    expect(alerts.map((row) => row.thresholdBp).sort((x, y) => x - y)).toEqual([5000, 8000])
    const [listed] = expectPage(
      await request(setup.app, 'GET', budgetsUrl(setup), { headers: asAdmin(setup) }),
      budgetDtoSchema,
    ).data
    expect(listed).toMatchObject({ id: budget.id, meter: { spentMicros: 9_100 } })
    expect(await outbox.service.relay()).toMatchObject({ failed: 0 })
  })
})

describe('run stats', () => {
  it('rolls finished non-test runs up per agent and day', async () => {
    const setup = await setupTwoOrgs()
    const model = await localModel(setup)
    const agent = expectData(
      await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/agents`, {
        headers: asAdmin(setup),
        payload: { name: 'Triage', modelKey: model },
      }),
      201,
      agentDetailDtoSchema,
    )
    const finishedAt = new Date()
    const run = (over: Partial<typeof agentRuns.$inferInsert>) => ({
      organizationId: setup.a.id,
      agentId: agent.id,
      trigger: 'chat' as 'chat' | 'test',
      startedAt: finishedAt,
      finishedAt,
      durationMs: 1000,
      costMicros: 10,
      ...over,
    })
    await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .insert(agentRuns)
        .values([
          run({ status: 'succeeded' }),
          run({ status: 'succeeded', humanCorrected: true, neededHuman: true }),
          run({ status: 'failed' }),
          run({ status: 'succeeded', isTest: true, trigger: 'test' }),
          run({ status: 'running', finishedAt: null }),
        ]),
    )
    await setup.container.modules.usage.rollup.aggregate('hourly')
    const rows = await setup.db.tenant(setup.a.id, (tx) => tx.select().from(runStatsDaily))
    expect(rows).toEqual([
      expect.objectContaining({
        subjectType: 'agent',
        subjectId: agent.id,
        day: finishedAt.toISOString().slice(0, 10),
        runsTotal: 3,
        runsSucceeded: 2,
        runsSucceededUncorrected: 1,
        runsFailed: 1,
        runsNeededHuman: 1,
        runsHumanCorrected: 1,
        durationMsSum: 3000,
        costMicros: 30,
      }),
    ])
  })
})

describe('the Insights budget meter', () => {
  it("shows this month's spend against the organization, a team or a person's budget", async () => {
    const setup = await setupAgents()
    const { uma } = setup.a.members
    const support = await createTeam(setup, 'Support', [uma.id])
    const meter = async (query: string, headers = asAdmin(setup)) =>
      expectData(
        await request(
          setup.app,
          'GET',
          `/api/v1/orgs/${setup.a.id}/insights/budget-meter${query}`,
          { headers },
        ),
        200,
        insightsBudgetMeterDtoSchema,
      ).meter
    // no budget yet: "No budget · Set one in Settings"
    expect(await meter('')).toEqual({ state: 'value', value: null })
    // the team budget comes first: an organization budget set below it caps it
    await createBudget(setup, { scope: 'team', teamId: support.id, amountMicros: 20_000 })
    await createBudget(setup, { scope: 'organization', amountMicros: 10_000 })
    await spend(setup, usageEvent({ userId: uma.id, teamId: support.id, costMicros: 6_000 }))
    expect(await meter('')).toMatchObject({
      state: 'value',
      value: { scope: 'organization', spentMicros: 6_000, usedBp: 6000, state: 'ok' },
    })
    expect(await meter(`?teamId=${support.id}`)).toMatchObject({
      state: 'value',
      value: { scope: 'team', amountMicros: 20_000, effectiveAmountMicros: 10_000 },
    })
    expect(await meter(`?userId=${uma.id}`)).toEqual({ state: 'value', value: null })
    // a Builder reads Insights for their own agents only
    const bella = await authHeaders(setup.app, setup.builders.bella)
    expect(await meter('', bella)).toEqual({ state: 'restricted' })
    expectError(
      await request(setup.app, 'GET', `/api/v1/orgs/${setup.a.id}/insights/budget-meter`, {
        headers: setup.sessionOf(uma),
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await request(
        setup.app,
        'GET',
        `/api/v1/orgs/${setup.a.id}/insights/budget-meter?teamId=${support.id}&userId=${uma.id}`,
        { headers: asAdmin(setup) },
      ),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })
})
