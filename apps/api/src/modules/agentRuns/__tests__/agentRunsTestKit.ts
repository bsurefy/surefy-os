// SPDX-License-Identifier: AGPL-3.0-only
import { eq, sql } from 'drizzle-orm'

import { agents, agentVersions, agentRuns, approvals } from '@/database/tables/index.js'
import { agentRunSteps } from '@/database/tables/partitioned/agentRuns.tables.js'
import { createEmptyAgentDefinition } from '@surefy/contracts'
import type { AgentDefinition, AgentTool } from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { createAgentRunsAgents, createAgentRunsPeople } from '../agentRuns.adapters.js'
import { createAgentRunsModule } from '../agentRuns.module.js'

import type { TestAppOptions } from '../../../../test/helpers/testApp.js'
import type {
  AgentRunsContext,
  AgentRunsEvents,
  AgentRunsGateway,
  AgentRunsKnowledge,
  AgentRunsTools,
  RunEventChunk,
  RunRow,
  StepRow,
} from '../agentRuns.types.js'
import type { Queues } from '@/core/queue/index.js'
import type { ResolvedTool, ToolOutcome } from '@/modules/agentTools/index.js'
import type { RetrievalResult } from '@/modules/knowledge/index.js'
import type { GatewayStream } from '@/modules/modelGateway/index.js'

export const MODEL_REF = {
  modelKey: 'openai/gpt-test',
  displayName: 'GPT Test',
  providerKey: 'openai',
  source: 'provider' as const,
}

const USAGE = {
  inputTokens: 100,
  outputTokens: 20,
  cachedInputTokens: 0,
  costMicros: 1500,
  currency: 'USD',
  firstTokenMs: 10,
  latencyMs: 50,
}

const callResult = {
  model: MODEL_REF,
  credentialScope: 'organization' as const,
  outcome: 'success' as const,
  routed: false,
  fallback: null,
  usage: USAGE,
}

/** What the fake model does for one call: answers with text, asks for tools, or fails. */
export type ModelScript =
  | { text: string }
  | { calls: { id: string; name: string; input: Record<string, unknown> }[]; text?: string }
  | { error: Error }
  | { hold: true }

interface Part {
  type: string
  [key: string]: unknown
}

const partsOf = (script: Exclude<ModelScript, { error: Error } | { hold: true }>): Part[] => {
  const parts: Part[] = []
  if ('text' in script && script.text !== undefined && script.text !== '') {
    parts.push(
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', text: script.text },
      { type: 'text-end', id: 't1' },
    )
  }
  if ('calls' in script) {
    for (const call of script.calls) {
      parts.push({
        type: 'tool-call',
        toolCallId: call.id,
        toolName: call.name,
        input: call.input,
      })
    }
  }
  parts.push({ type: 'finish', finishReason: 'calls' in script ? 'tool-calls' : 'stop' })
  return parts
}

/** The model gateway, scripted: each streamed call takes the next script, each decision the next answer. */
export class FakeGateway implements AgentRunsGateway {
  scripts: ModelScript[] = []
  decisions: { value: boolean; confidence: number; reasoning?: string }[] = []
  streamed: {
    ctx: Parameters<AgentRunsGateway['streamText']>[0]
    request: Parameters<AgentRunsGateway['streamText']>[1]
  }[] = []
  decided: { ctx: Parameters<AgentRunsGateway['decide']>[0]; question: string; input: string }[] =
    []

  streamText: AgentRunsGateway['streamText'] = (ctx, request) => {
    this.streamed.push({ ctx, request })
    const script = this.scripts.shift()
    if (script === undefined) return Promise.reject(new Error('no model script left'))
    if ('error' in script) return Promise.reject(script.error)
    const signal = request.signal
    const stream = async function* () {
      if ('hold' in script) {
        await new Promise<void>((_, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('aborted', 'AbortError'))
            },
            { once: true },
          )
        })
        return
      }
      for (const part of partsOf(script)) yield part
    }
    return Promise.resolve({
      result: { stream: stream() },
      model: MODEL_REF,
      fallback: null,
      call: Promise.resolve(callResult),
    } as unknown as GatewayStream)
  }

  decide: AgentRunsGateway['decide'] = (ctx, request) => {
    this.decided.push({ ctx, question: request.question, input: request.input })
    const next = this.decisions.shift() ?? { value: true, confidence: 0.95 }
    return Promise.resolve({
      value: next.value,
      confidence: next.confidence,
      reasoning: next.reasoning ?? 'Matches the request',
      call: callResult,
    })
  }
}

export const refundTool = (permission: ResolvedTool['permission'] = 'can_act'): ResolvedTool => ({
  callName: 'refund_api',
  toolId: '0198f3a0-0000-7000-8000-0000000000e1',
  kind: 'api',
  label: 'Refund API',
  toolName: 'refund_api',
  action: 'refund_api',
  actionName: null,
  description: 'Refunds an order',
  inputSchema: { type: 'object', properties: { amount: { type: 'number' } } },
  permission,
  declaredPermission: permission,
  definition: {} as never,
})

export const lookupTool = (): ResolvedTool => ({
  ...refundTool('read_only'),
  callName: 'lookup_api',
  toolName: 'lookup_api',
  action: 'lookup_api',
  label: 'Lookup API',
  toolId: '0198f3a0-0000-7000-8000-0000000000e2',
})

/** The tool adapters, scripted: tools are offered as given and answer from `outcomes`. */
export class FakeTools implements AgentRunsTools {
  tools: ResolvedTool[] = []
  outcomes: ToolOutcome[] = []
  executed: { tool: string; args: Record<string, unknown> }[] = []
  /** Runs while a call is "in flight": a test settles an approval or cancels the run here. */
  onExecute: ((tool: string) => Promise<void>) | null = null

  resolve: AgentRunsTools['resolve'] = () => Promise.resolve(this.tools)

  execute: AgentRunsTools['execute'] = async (_ctx, tool, args) => {
    this.executed.push({ tool: tool.callName, args })
    if (this.onExecute !== null) await this.onExecute(tool.callName)
    return this.outcomes.shift() ?? ok('Done')
  }
}

export const ok = (content: string): ToolOutcome => ({
  ok: true,
  content,
  data: null,
  truncated: false,
  latencyMs: 5,
  target: 'POST https://api.test/refunds',
  attempts: 1,
})

export const failed = (content: string, code = 'AGENT_TOOL_FAILED'): ToolOutcome => ({
  ok: false,
  code,
  message: content,
  content,
  target: 'POST https://api.test/refunds',
  attempts: 1,
})

export class FakeKnowledge implements AgentRunsKnowledge {
  result: RetrievalResult = { passages: [], skippedLocalOnly: [], notSearchedSourceCount: 0 }
  requests: Parameters<AgentRunsKnowledge['retrieve']>[0][] = []
  failWith: Error | null = null

  retrieve: AgentRunsKnowledge['retrieve'] = (request) => {
    this.requests.push(request)
    return this.failWith === null ? Promise.resolve(this.result) : Promise.reject(this.failWith)
  }
}

export class CapturedEvents implements AgentRunsEvents {
  chunks: { runId: string; chunk: RunEventChunk }[] = []

  publish: AgentRunsEvents['publish'] = (_orgId, runId, chunk) => {
    this.chunks.push({ runId, chunk })
    return Promise.resolve()
  }

  types(runId?: string): string[] {
    return this.chunks
      .filter((entry) => runId === undefined || entry.runId === runId)
      .map((entry) => entry.chunk.type)
  }
}

export interface RunsSetup extends TwoOrgSetup {
  gateway: FakeGateway
  tools: FakeTools
  knowledge: FakeKnowledge
  events: CapturedEvents
  runs: ReturnType<typeof createAgentRunsModule>
  /** Jobs the module put on the queue: `{ name, payload, jobId }`. */
  enqueued: { payload: Record<string, unknown>; jobId: string | undefined }[]
  /** The context of one of A's people. */
  ctx: (
    who: 'olivia' | 'adam' | 'uma',
    limits?: Partial<AgentRunsContext['access']['limits']>,
  ) => AgentRunsContext
  /** A published agent of A owned by Olivia, with the given definition. */
  agent: (definition?: Partial<AgentDefinition>) => Promise<{ id: string; versionId: string }>
  /** Starts a test run as Olivia and returns it. */
  startTest: (agentId: string, text?: string) => Promise<RunRow>
  /** Runs the executor for a run to its next stopping point. */
  execute: (runId: string, extra?: { approvalId?: string; final?: boolean }) => Promise<void>
  /** The run row and its steps. */
  read: (runId: string) => Promise<{ run: RunRow; steps: StepRow[] }>
  /** Test-only SQL as the owner. */
  ownerSql: (statement: ReturnType<typeof sql>) => Promise<void>
}

const fakeQueues = (sink: RunsSetup['enqueued']): Queues =>
  ({
    enqueue: (_job: unknown, payload: Record<string, unknown>, options?: { jobId?: string }) => {
      sink.push({ payload, jobId: options?.jobId })
      return Promise.resolve(options?.jobId ?? 'job')
    },
  }) as unknown as Queues

/** The agent run module over the real database, Guard and approvals, with a scripted model, tools and knowledge. */
export async function setupRuns(options: TestAppOptions = {}): Promise<RunsSetup> {
  const setup = await setupTwoOrgs(options)
  const { container } = setup
  const gateway = new FakeGateway()
  const tools = new FakeTools()
  const knowledge = new FakeKnowledge()
  const events = new CapturedEvents()
  const enqueued: RunsSetup['enqueued'] = []
  const runs = createAgentRunsModule({
    db: setup.db,
    cache: container.cache,
    queues: fakeQueues(enqueued),
    logger: container.logger,
    agents: createAgentRunsAgents(container.modules.agents.repository),
    people: createAgentRunsPeople(container.modules.access.service),
    guard: container.modules.guard.engine,
    gateway,
    tools,
    knowledge,
    approvals: container.modules.approvals.service,
    audit: container.modules.audit.service,
    outbox: () => container.modules.outbox.service,
    events,
    heartbeatMs: 25,
  })

  const ctx: RunsSetup['ctx'] = (who, limits = {}) => ({
    orgId: setup.a.id,
    userId: setup.a.members[who].id,
    teamIds: [],
    role: setup.a.members[who].role,
    access: {
      permissions: ['agents:manage-all'] as never,
      limits: { maxRunsPerMonth: null, ...limits } as never,
      reasons: [],
    },
  })

  const read: RunsSetup['read'] = (runId) =>
    setup.db.tenant(setup.a.id, async (tx) => {
      const run = await runs.repository.findRun(tx, setup.a.id, runId)
      if (run === undefined) throw new Error('run not found')
      return { run, steps: await runs.repository.listSteps(tx, setup.a.id, run) }
    })

  return Object.assign(setup, {
    gateway,
    tools,
    knowledge,
    events,
    runs,
    enqueued,
    ctx,
    read,
    agent: async (overrides: Partial<AgentDefinition> = {}) => {
      const definition: AgentDefinition = {
        ...createEmptyAgentDefinition(MODEL_REF.modelKey),
        instructions: 'Help with refunds.',
        ...overrides,
      }
      return setup.db.tenant(setup.a.id, async (tx) => {
        const [agent] = await tx
          .insert(agents)
          .values({
            organizationId: setup.a.id,
            name: 'Refund agent',
            status: 'active',
            ownerUserId: setup.a.members.olivia.id,
            draftDefinition: definition,
          })
          .returning({ id: agents.id })
        if (agent === undefined) throw new Error('agent seed failed')
        const [version] = await tx
          .insert(agentVersions)
          .values({ organizationId: setup.a.id, agentId: agent.id, version: 1, definition })
          .returning({ id: agentVersions.id })
        if (version === undefined) throw new Error('version seed failed')
        await tx.update(agents).set({ liveVersionId: version.id }).where(eq(agents.id, agent.id))
        return { id: agent.id, versionId: version.id }
      })
    },
    startTest: (agentId: string, text = 'Refund order 1182') =>
      runs.service.start(ctx('olivia'), {
        agentId,
        trigger: 'test',
        input: { messages: [{ role: 'user', text }] },
      }),
    execute: (runId: string, extra: { approvalId?: string; final?: boolean } = {}) =>
      runs.executor.execute(
        {
          orgId: setup.a.id,
          runId,
          ...(extra.approvalId === undefined ? {} : { approvalId: extra.approvalId }),
        },
        { final: extra.final ?? false },
      ),
    ownerSql: async (statement: ReturnType<typeof sql>) => {
      await setup.owner.system('test', (tx) => tx.execute(statement))
    },
  })
}

/** An api tool entry of a definition (the fake adapters ignore it, but readiness-like code reads the list). */
export const apiToolDefinition = (): AgentTool => ({
  id: '0198f3a0-0000-7000-8000-0000000000e1',
  name: 'Refund API',
  description: 'Refunds an order',
  permission: 'can_act',
  enabled: true,
  kind: 'api',
  method: 'POST',
  url: 'https://api.test/refunds',
  headers: [],
  inputSchema: null,
  connectionId: null,
})

/** Decides an approval the way a person or the timeout would, as the owner (the API needs step-up). */
export async function settleApproval(
  setup: RunsSetup,
  approvalId: string,
  how:
    | { status: 'approved'; editedInput?: Record<string, unknown> }
    | { status: 'rejected' }
    | { status: 'expired'; timeoutAction: 'reject' | 'continue' },
): Promise<void> {
  const decider = setup.a.members.adam.id
  if (how.status === 'approved') {
    const edited =
      how.editedInput === undefined
        ? sql`null`
        : sql`jsonb_set(payload, '{action,input}', ${JSON.stringify(how.editedInput)}::jsonb)`
    await setup.ownerSql(sql`update approvals set status = 'approved', resolved_by = 'user',
      decided_by_user_id = ${decider}, decided_at = now(), edited_payload = ${edited}
      where id = ${approvalId}`)
  } else if (how.status === 'rejected') {
    await setup.ownerSql(sql`update approvals set status = 'rejected', resolved_by = 'user',
      decided_by_user_id = ${decider}, decided_at = now(), decision_reason = 'not_eligible'
      where id = ${approvalId}`)
  } else {
    await setup.ownerSql(sql`update approvals set status = 'expired', resolved_by = 'timeout',
      decided_at = now(), timeout_action = ${how.timeoutAction}, expires_at = now() - interval '1 minute'
      where id = ${approvalId}`)
  }
}

/** The approvals a run asked for, oldest first. */
export const approvalsOf = (setup: RunsSetup, runId: string) =>
  setup.db.tenant(setup.a.id, (tx) =>
    tx.select().from(approvals).where(eq(approvals.agentRunId, runId)).orderBy(approvals.createdAt),
  )

export const stepsOfType = (steps: readonly StepRow[], type: StepRow['type']) =>
  steps.filter((step) => step.type === type)

export { agentRuns, agentRunSteps, approvals }

/** The row at an index; a missing row fails the test with a clear message instead of a non-null assertion. */
export function only<T>(rows: readonly (T | undefined)[], index = 0): T {
  const row = rows[index]
  if (row === undefined) throw new Error(`no row at index ${index}`)
  return row
}
