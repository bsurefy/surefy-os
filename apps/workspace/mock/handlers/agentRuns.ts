// SPDX-License-Identifier: AGPL-3.0-only
import {
  agentRunDetailDtoSchema,
  agentRunDtoSchema,
  agentRunStepDetailDtoSchema,
  agentRunStepsDtoSchema,
  ERROR_CODES,
  listAgentRunsQuerySchema,
  okResponse,
  pageResponse,
  retryAgentRunInputSchema,
  startTestRunInputSchema,
} from '@surefy/contracts'
import type {
  AgentRunDetailDto,
  AgentRunMessage,
  AgentRunStatus,
  AgentRunStepData,
  AgentRunStepDetailDto,
  AgentRunStepStatus,
  AgentRunStepType,
  ApprovalDto,
} from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { READ_ONLY_AGENT_ID, SUPPORT_AGENT_ID } from './agentIds'
import { addApproval, findApproval, resetApprovalsMock } from './approvals'
import { sleep, sseResponse } from './runStream'
import { MAYA, OMAR } from './shell.fixtures'
import { ANA } from './teams'

import type { StreamChunk } from './runStream'

const RUN_KIND = 75
const STEP_KIND = 76
const APPROVAL_KIND = 77
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const SEED_ANCHOR = Date.parse('2026-01-15T09:00:00.000Z')
const MINUTE_MS = 60_000
const CURRENCY = 'USD'

/** The agents the runs belong to: the agents mock registers itself, so the two stay in step. */
type AgentLookup = (id: string) => { id: string; name: string; draftUpdatedAt: string } | undefined
let agentLookup: AgentLookup | null = null
const lookupAgent: AgentLookup = (id) => agentLookup?.(id)

export function setAgentLookup(lookup: AgentLookup): void {
  agentLookup = lookup
}

const MODEL = {
  modelKey: 'openai/gpt-4.1',
  displayName: 'GPT-4.1',
  providerKey: 'openai',
  source: 'provider',
} as const

// ── The scripts a run follows ────────────────────────────────────────────────────────────────────

/** What the last message asks for decides how the run goes. */
export type RunPlan = 'plain' | 'refund' | 'failing'

interface StepSpec {
  type: AgentRunStepType
  name: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  costMicros?: number
  confidence?: number
  guardBand?: 'auto' | 'double_check' | 'human' | 'blocked'
  /** The step is an approval a person has to decide. */
  waitsForApproval?: boolean
  /** The step fails and so does the run. */
  fails?: boolean
  /** Reused from an earlier run ("Retry step"): shown as skipped. */
  isSkipped?: boolean
  /** The model step that answers: this text is streamed. */
  answer?: boolean
  input?: AgentRunStepData
  output?: AgentRunStepData
}

const FAILURE_CODE = ERROR_CODES.AGENT_TOOL_TIMEOUT
const REFUND_TITLE = 'Refund $120.00 for order 4821'
const ANSWERS: Record<RunPlan, string> = {
  plain:
    'Your order ships within two business days, and you will get a tracking link by email as soon as it leaves the warehouse.',
  refund:
    'I have refunded $120.00 for order 4821. It can take three to five business days to reach your card.',
  failing: 'Order 4821 left the warehouse yesterday and arrives on Friday.',
}

const data = <Kind extends AgentRunStepData['kind']>(
  kind: Kind,
  rest: Omit<Extract<AgentRunStepData, { kind: Kind }>, 'kind' | 'version' | 'truncated'>,
) => ({ kind, version: 1, truncated: false, ...rest }) as AgentRunStepData

const retrieval = (): StepSpec => ({
  type: 'retrieval',
  name: 'Search Help center',
  durationMs: 420,
  output: data('retrieval', {
    query: 'order status and refunds',
    passages: [
      {
        documentId: fixtureUuid(81, 1),
        title: 'Refund policy',
        page: 2,
        score: 0.82,
        text: 'Refunds are paid back to the original payment method within five business days.',
      },
      {
        documentId: fixtureUuid(81, 2),
        title: 'Shipping times',
        page: null,
        score: 0.71,
        text: 'Orders ship within two business days.',
      },
    ],
  }),
})

const modelCall = (options: Partial<StepSpec> = {}): StepSpec => ({
  type: 'model',
  name: 'GPT-4.1',
  durationMs: 1380,
  inputTokens: 842,
  outputTokens: 96,
  costMicros: 2900,
  ...options,
})

/** The steps of a plan, in order; `fails` makes the tool step fail, `skipBefore` marks the first steps reused. */
export function specsFor(
  plan: RunPlan,
  { fails = plan === 'failing', skipBefore = 0 } = {},
): StepSpec[] {
  const callsTool = (name: string, input: Record<string, unknown>): StepSpec =>
    modelCall({
      outputTokens: 41,
      costMicros: 1800,
      output: data('model', {
        finishReason: 'tool-calls',
        toolCalls: [{ id: 'call-1', name, arguments: input }],
      }),
    })
  let specs: StepSpec[]
  if (plan === 'plain') {
    specs = [retrieval(), modelCall({ answer: true })]
  } else if (plan === 'refund') {
    const confidence = 0.74
    specs = [
      retrieval(),
      callsTool('Refund API', { orderId: '4821', amount: 120 }),
      {
        type: 'decision',
        name: 'Refund allowed?',
        durationMs: 640,
        inputTokens: 310,
        outputTokens: 18,
        costMicros: 900,
        confidence,
        output: data('decision', {
          question: 'Is a refund of $120.00 allowed by the policy?',
          options: ['yes', 'no'],
          value: 'yes',
          reasoning: 'The order is 6 days old and the refund policy allows 30 days.',
        }),
      },
      {
        type: 'guard',
        name: 'Refund API',
        durationMs: 35,
        confidence,
        guardBand: 'human',
        output: data('guard', {
          action: 'Refund API',
          result: {
            outcome: 'human',
            confidence,
            thresholds: { autoBp: 9000, reviewBp: 6000 },
            matchedRules: [{ ref: 'agent:refund:v1:refunds', type: 'approval_rule' }],
            doubleCheck: null,
            approvalId: null,
            reasonCode: null,
          },
        }),
      },
      { type: 'approval', name: REFUND_TITLE, durationMs: 0, waitsForApproval: true },
      {
        type: 'tool',
        name: 'Refund API',
        durationMs: 780,
        input: data('tool', { arguments: { orderId: '4821', amount: 120 } }),
        output: data('tool', { result: { refundId: 're_9031', status: 'paid' } }),
      },
      modelCall({ answer: true, inputTokens: 1140 }),
    ]
  } else {
    specs = [
      retrieval(),
      callsTool('Order lookup', { orderId: '4821' }),
      {
        type: 'tool',
        name: 'Order lookup',
        durationMs: fails ? 30_000 : 520,
        fails,
        input: data('tool', { arguments: { orderId: '4821' } }),
        output: fails
          ? data('tool', { isError: true, result: { error: 'No answer within 30 seconds' } })
          : data('tool', { result: { status: 'shipped', arrivesOn: 'Friday' } }),
      },
      modelCall({ answer: true, inputTokens: 1020 }),
    ]
  }
  return specs.map((spec, position) =>
    position < skipBefore ? { ...spec, isSkipped: true, fails: false } : spec,
  )
}

// ── Stored runs ──────────────────────────────────────────────────────────────────────────────────

interface StoredRun {
  run: AgentRunDetailDto
  steps: AgentRunStepDetailDto[]
  plan: RunPlan
  specs: StepSpec[]
  messages: AgentRunMessage[]
  /** The approval the run waits for. */
  approvalId: string | null
}

let sequence = 0
let runs = new Map<string, StoredRun>()
/** Bumped on reset: a run still streaming from before it stops and stores nothing. */
let generation = 0
/** Milliseconds a step takes to appear in a stream; tests set it to 0. */
let streamDelayMs = 40

export function setRunStreamDelay(ms: number): void {
  streamDelayMs = ms
}

const nextId = (kind: number) => fixtureUuid(kind, ++sequence)

const SEED_STATUSES: readonly {
  status: AgentRunStatus
  plan: RunPlan
  trigger: 'chat' | 'api' | 'widget' | 'slack'
  neededHuman?: boolean
  humanCorrected?: boolean
}[] = [
  { status: 'waiting_approval', plan: 'refund', trigger: 'chat', neededHuman: true },
  { status: 'succeeded', plan: 'plain', trigger: 'chat' },
  { status: 'succeeded', plan: 'refund', trigger: 'chat', neededHuman: true },
  { status: 'failed', plan: 'failing', trigger: 'api' },
  { status: 'succeeded', plan: 'plain', trigger: 'widget' },
  { status: 'succeeded', plan: 'plain', trigger: 'slack', humanCorrected: true },
  { status: 'succeeded', plan: 'failing', trigger: 'chat' },
  { status: 'canceled', plan: 'plain', trigger: 'chat' },
  { status: 'succeeded', plan: 'plain', trigger: 'api' },
  { status: 'timed_out', plan: 'failing', trigger: 'api' },
  { status: 'succeeded', plan: 'plain', trigger: 'chat' },
  { status: 'succeeded', plan: 'plain', trigger: 'widget' },
]

const SEED_QUESTIONS: Record<RunPlan, string> = {
  plain: 'Where is my order?',
  refund: 'I would like a refund for order 4821',
  failing: 'When does order 4821 arrive?',
}

function stepOf(
  spec: StepSpec,
  seq: number,
  startedAt: number,
  status: AgentRunStepStatus,
  approvalId: string | null,
): AgentRunStepDetailDto {
  const isSkipped = spec.isSkipped === true
  const duration = isSkipped ? 0 : spec.durationMs
  return {
    id: nextId(STEP_KIND),
    seq,
    type: spec.type,
    name: spec.name,
    status,
    modelKey: spec.type === 'model' || spec.type === 'decision' ? MODEL.modelKey : null,
    inputTokens: isSkipped ? 0 : (spec.inputTokens ?? 0),
    outputTokens: isSkipped ? 0 : (spec.outputTokens ?? 0),
    costMicros: isSkipped ? 0 : (spec.costMicros ?? 0),
    currency: CURRENCY,
    confidence: spec.confidence ?? null,
    guardBand: spec.guardBand ?? null,
    approvalId,
    dataLocation: spec.type === 'model' || spec.type === 'decision' ? 'provider' : null,
    errorCode: status === 'failed' ? FAILURE_CODE : null,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: status === 'waiting' ? null : new Date(startedAt + duration).toISOString(),
    durationMs: status === 'waiting' ? null : duration,
    input: spec.input ?? null,
    output: spec.output ?? null,
  }
}

const statusOfStep = (spec: StepSpec, isDone: boolean): AgentRunStepStatus => {
  if (spec.isSkipped) return 'skipped'
  if (spec.waitsForApproval && !isDone) return 'waiting'
  return spec.fails ? 'failed' : 'succeeded'
}

/** The run's totals from its steps, so the list and the detail agree with the trace. */
function withTotals(stored: StoredRun): StoredRun {
  const { steps, run } = stored
  const startedAt = steps[0]?.startedAt ?? run.startedAt
  const last = steps.at(-1)
  const durationMs = steps.reduce((total, step) => total + (step.durationMs ?? 0), 0)
  const confidences = steps.flatMap((step) => (step.confidence === null ? [] : [step.confidence]))
  return {
    ...stored,
    run: {
      ...run,
      stepCount: steps.length,
      inputTokens: steps.reduce((total, step) => total + step.inputTokens, 0),
      outputTokens: steps.reduce((total, step) => total + step.outputTokens, 0),
      costMicros: steps.reduce((total, step) => total + step.costMicros, 0),
      minConfidence: confidences.length > 0 ? Math.min(...confidences) : null,
      startedAt,
      durationMs: run.status === 'queued' ? null : durationMs,
      finishedAt:
        ['succeeded', 'failed', 'canceled', 'timed_out'].includes(run.status) && last
          ? (last.finishedAt ?? run.finishedAt)
          : null,
    },
  }
}

const detailOf = (stored: StoredRun): AgentRunDetailDto => stored.run

function newRun(
  agent: { id: string; name: string },
  overrides: Partial<AgentRunDetailDto>,
): AgentRunDetailDto {
  const now = new Date().toISOString()
  return {
    id: nextId(RUN_KIND),
    agent: { id: agent.id, name: agent.name },
    isAgentDeleted: false,
    agentVersion: null,
    trigger: 'test',
    isTest: true,
    status: 'queued',
    startedBy: MAYA,
    channel: null,
    model: MODEL,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    currency: CURRENCY,
    minConfidence: null,
    neededHuman: false,
    humanCorrected: false,
    stepCount: 0,
    errorCode: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    createdAt: now,
    summary: null,
    retryOf: null,
    dataLocations: ['provider'],
    pendingApprovalIds: [],
    canCancel: true,
    canRetry: false,
    ...overrides,
  }
}

const stateFlags = (status: AgentRunStatus) => ({
  canCancel: ['queued', 'running', 'waiting_approval'].includes(status),
  canRetry: ['succeeded', 'failed', 'canceled', 'timed_out'].includes(status),
})

function approvalOf(id: string, run: AgentRunDetailDto): ApprovalDto {
  const now = new Date().toISOString()
  return {
    id,
    kind: 'ai_action',
    status: 'pending',
    title: REFUND_TITLE,
    amountMicros: 120_000_000,
    currency: CURRENCY,
    confidence: 0.74,
    risk: 'medium',
    ruleRef: `agent:${run.agent?.id ?? ''}:v1:refunds`,
    ruleName: null,
    agent: run.agent,
    flow: null,
    agentRunId: run.id,
    flowRunId: null,
    requestedBy: null,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    decisionNote: null,
    requiresStepUp: false,
    expiresAt: new Date(Date.now() + 60 * MINUTE_MS).toISOString(),
    timeoutAction: 'reject',
    escalatedAt: null,
    resolvedBy: null,
    assignees: [{ subjectType: 'user', user: MAYA, team: null, role: null, source: 'rule' }],
    canDecide: true,
    isOverdue: false,
    quickApprovable: false,
    createdAt: now,
    updatedAt: now,
  }
}

const ERROR_OF_STATUS: Partial<Record<AgentRunStatus, string>> = {
  failed: FAILURE_CODE,
  timed_out: ERROR_CODES.AGENT_RUN_TIMED_OUT,
}

const seedAgentIds = () => [SUPPORT_AGENT_ID, READ_ONLY_AGENT_ID]

const SEED_PEOPLE = [MAYA, OMAR, ANA, null]

/** One seeded run with its whole trace; a waiting run stops at its approval, a failed one at its failure. */
function seedRun(
  agent: { id: string; name: string },
  startedAt: number,
  position: number,
  seed: (typeof SEED_STATUSES)[number],
): StoredRun {
  const isWaiting = seed.status === 'waiting_approval'
  const specs = specsFor(seed.plan, {
    fails: seed.status === 'failed' || seed.status === 'timed_out',
  })
  const waitingAt = specs.findIndex((spec) => spec.waitsForApproval) + 1
  const failedAt = specs.findIndex((spec) => spec.fails) + 1
  let used = specs.length
  if (isWaiting) used = waitingAt
  else if (seed.status === 'failed') used = failedAt
  const approvalId = isWaiting ? nextId(APPROVAL_KIND) : null
  let cursor = startedAt
  const run = newRun(agent, {
    agentVersion: 3,
    trigger: seed.trigger,
    isTest: false,
    status: seed.status,
    startedBy:
      seed.trigger === 'chat' ? (SEED_PEOPLE[position % SEED_PEOPLE.length] ?? null) : null,
    neededHuman: seed.neededHuman ?? false,
    humanCorrected: seed.humanCorrected ?? false,
    errorCode: ERROR_OF_STATUS[seed.status] ?? null,
    createdAt: new Date(startedAt).toISOString(),
    pendingApprovalIds: approvalId ? [approvalId] : [],
    ...stateFlags(seed.status),
  })
  const steps = specs.slice(0, used).map((spec, index) => {
    const step = stepOf(
      spec,
      index + 1,
      cursor,
      statusOfStep(spec, !isWaiting),
      spec.waitsForApproval ? approvalId : null,
    )
    cursor += step.durationMs ?? 0
    return step
  })
  const outcome = ANSWERS[seed.plan].split('. ')[0] ?? ANSWERS[seed.plan]
  const summary: AgentRunDetailDto['summary'] =
    seed.status === 'succeeded'
      ? {
          version: 1,
          outcome,
          toolsUsed: seed.plan === 'plain' ? [] : ['Order lookup'],
          sourcesCount: 2,
          guardChecks: {},
          approvalIds: [],
          dataLocations: ['provider'],
        }
      : null
  const stored = withTotals({
    run: { ...run, summary },
    steps,
    plan: seed.plan,
    specs,
    messages: [{ role: 'user', text: SEED_QUESTIONS[seed.plan] }],
    approvalId,
  })
  if (approvalId) addApproval(approvalOf(approvalId, stored.run))
  return stored
}

/** Finished and waiting runs of two seeded agents, newest first; each has its whole trace. */
function seedRuns(): Map<string, StoredRun> {
  const seeded = new Map<string, StoredRun>()
  for (const [agentPosition, agentId] of seedAgentIds().entries()) {
    const agent = lookupAgent(agentId)
    if (!agent) continue
    for (const [position, seed] of SEED_STATUSES.entries()) {
      const startedAt = SEED_ANCHOR - (position * 7 + agentPosition) * 61 * MINUTE_MS
      const stored = seedRun(agent, startedAt, position, seed)
      seeded.set(stored.run.id, stored)
    }
  }
  return seeded
}

let seedPending = true

/** Back to the seeded runs; tests call it between cases. */
export function resetAgentRunsMock(): void {
  generation += 1
  sequence = 0
  runs = new Map()
  seedPending = true
  streamDelayMs = 40
  resetApprovalsMock()
}

function allRuns(): Map<string, StoredRun> {
  if (seedPending) {
    seedPending = false
    for (const [id, stored] of seedRuns()) runs.set(id, stored)
  }
  return runs
}

/** Whether the agent has a test run that started after its draft last changed. */
export function hasTestRunSince(agentId: string, since: string): boolean {
  return [...allRuns().values()].some(
    ({ run }) =>
      run.isTest &&
      run.agent?.id === agentId &&
      run.startedAt !== null &&
      run.startedAt >= since &&
      run.status !== 'queued',
  )
}

// ── Driving a run ────────────────────────────────────────────────────────────────────────────────

const planOf = (messages: AgentRunMessage[]): RunPlan => {
  const text = (messages.findLast((message) => message.role === 'user')?.text ?? '').toLowerCase()
  if (text.includes('refund')) return 'refund'
  if (text.includes('broken') || text.includes('fail') || text.includes('arrive')) return 'failing'
  return 'plain'
}

function save(stored: StoredRun): StoredRun {
  const updated = withTotals(stored)
  runs.set(updated.run.id, updated)
  return updated
}

function setStatus(stored: StoredRun, status: AgentRunStatus, errorCode: string | null = null) {
  return save({
    ...stored,
    run: {
      ...stored.run,
      status,
      errorCode,
      ...stateFlags(status),
      pendingApprovalIds:
        status === 'waiting_approval' && stored.approvalId ? [stored.approvalId] : [],
    },
  })
}

const stepEvent = (step: AgentRunStepDetailDto): StreamChunk => {
  const row: Partial<AgentRunStepDetailDto> = { ...step }
  delete row.input
  delete row.output
  return { type: 'data-step', data: row }
}

const runEvent = (stored: StoredRun): StreamChunk => ({
  type: 'data-run',
  data: { runId: stored.run.id, status: stored.run.status, errorCode: stored.run.errorCode },
})

/** Where a run's events go, and whether the reader (or a reset) ended the stream. */
interface Session {
  runId: string
  write: (chunk: StreamChunk) => void
  stop: () => boolean
}

/** How one stretch of a run ended: go on, the stream is over, or the run failed. */
type Outcome = 'continue' | 'over' | 'failed'

const reload = (session: Session, fallback: StoredRun): StoredRun =>
  runs.get(session.runId) ?? fallback

/** A run that ended before this stream attached: the answer comes whole, then how it ended. */
function replayEnded(session: Session, stored: StoredRun): boolean {
  const { write } = session
  if (stored.run.status === 'succeeded') {
    write({ type: 'text-start', id: 't1' })
    write({ type: 'text-delta', id: 't1', delta: ANSWERS[stored.plan] })
    write({ type: 'text-end', id: 't1' })
  }
  write(runEvent(stored))
  if (stored.run.errorCode) {
    write({ type: 'error', errorText: stored.run.errorCode })
    return false
  }
  write({ type: 'finish' })
  return true
}

/** The step that waits for an approval is stored; the run goes on once somebody approved it. */
async function resumeAfterApproval(
  session: Session,
  stored: StoredRun,
  waiting: AgentRunStepDetailDto,
): Promise<Outcome> {
  const { write } = session
  write(runEvent(stored))
  write(stepEvent(waiting))
  if (!stored.approvalId || (await waitForApproval(stored.approvalId, session.stop)) === null) {
    return 'over'
  }
  const current = reload(session, stored)
  if (current.run.status === 'canceled') return 'over'
  const approved: AgentRunStepDetailDto = {
    ...waiting,
    status: 'succeeded',
    durationMs: 4200,
    finishedAt: new Date().toISOString(),
    output: data('approval', { outcome: 'approved', ruleRef: 'agent:refund:v1:refunds' }),
  }
  const saved = save({
    ...current,
    steps: current.steps.map((step) => (step.id === waiting.id ? approved : step)),
    approvalId: null,
  })
  write(stepEvent(approved))
  write(runEvent(setStatus(saved, 'running')))
  return 'continue'
}

/** The step that needs a person: the approval is created and the run waits for it. */
function askForApproval(session: Session, stored: StoredRun, spec: StepSpec): void {
  const approvalId = nextId(APPROVAL_KIND)
  const step = stepOf(spec, stored.steps.length + 1, Date.now(), 'waiting', approvalId)
  addApproval(approvalOf(approvalId, stored.run))
  const saved = save({
    ...stored,
    steps: [...stored.steps, step],
    approvalId,
    run: { ...stored.run, neededHuman: true },
  })
  session.write(stepEvent(step))
  session.write({
    type: 'data-approval-required',
    data: {
      seq: step.seq,
      approvalId,
      title: spec.name,
      assignees: [{ subjectType: 'user', user: MAYA, team: null, role: null, source: 'rule' }],
      expiresAt: new Date(Date.now() + 60 * MINUTE_MS).toISOString(),
    },
  })
  session.write(runEvent(setStatus(saved, 'waiting_approval')))
}

/** The answer of the model, a few words at a time. */
async function streamAnswer(session: Session, plan: RunPlan): Promise<boolean> {
  session.write({ type: 'text-start', id: 't1' })
  for (const word of ANSWERS[plan].split(/(?<=\s)/)) {
    if (session.stop()) return false
    session.write({ type: 'text-delta', id: 't1', delta: word })
    await sleep(streamDelayMs / 4)
  }
  session.write({ type: 'text-end', id: 't1' })
  return true
}

/** The data chunks a finished step adds to its own. */
function extraEvents(spec: StepSpec, step: AgentRunStepDetailDto): StreamChunk[] {
  if (spec.type === 'guard') {
    const output = spec.output as { result?: unknown } | undefined
    return [
      { type: 'data-guard', data: { seq: step.seq, action: spec.name, result: output?.result } },
    ]
  }
  if (spec.type !== 'model') return []
  return [
    {
      type: 'data-usage',
      data: {
        seq: step.seq,
        inputTokens: step.inputTokens,
        outputTokens: step.outputTokens,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        costMicros: step.costMicros,
        currency: CURRENCY,
        firstTokenMs: 240,
        latencyMs: step.durationMs ?? 0,
      },
    },
  ]
}

/** One step that needs no person: it is stored and told; a failed step fails the run. */
async function runStep(session: Session, stored: StoredRun, spec: StepSpec): Promise<Outcome> {
  const status = statusOfStep(spec, true)
  const step = stepOf(spec, stored.steps.length + 1, Date.now(), status, null)
  if (spec.answer && !(await streamAnswer(session, stored.plan))) return 'over'
  const saved = save({ ...stored, steps: [...stored.steps, step] })
  session.write(stepEvent(step))
  for (const event of extraEvents(spec, step)) session.write(event)
  if (status !== 'failed') return 'continue'
  session.write(runEvent(setStatus(saved, 'failed', step.errorCode)))
  session.write({ type: 'error', errorText: step.errorCode ?? ERROR_CODES.AGENT_TOOL_FAILED })
  return 'failed'
}

/** The run ended well: its summary is stored and the stream finishes. */
function finishRun(session: Session, stored: StoredRun): void {
  const done = save({
    ...setStatus(stored, 'succeeded'),
    run: {
      ...setStatus(stored, 'succeeded').run,
      summary: {
        version: 1,
        outcome: ANSWERS[stored.plan].split('. ')[0] ?? ANSWERS[stored.plan],
        toolsUsed: stored.specs.filter((spec) => spec.type === 'tool').map((spec) => spec.name),
        sourcesCount: 2,
        guardChecks: stored.specs.some((spec) => spec.type === 'guard') ? { human: 1 } : {},
        approvalIds: [],
        dataLocations: ['provider'],
      },
    },
  })
  session.write({ type: 'finish-step' })
  session.write(runEvent(done))
  session.write({ type: 'finish' })
}

/** The next stretch of the run: wait for an approval, ask for one, or run the next step. */
async function advance(session: Session, stored: StoredRun): Promise<Outcome> {
  const waiting = stored.steps.find((step) => step.status === 'waiting')
  if (waiting) return resumeAfterApproval(session, stored, waiting)
  const spec = stored.specs[stored.steps.length]
  if (!spec) return 'over'
  await sleep(streamDelayMs)
  if (session.stop()) return 'over'
  if (spec.waitsForApproval && !spec.isSkipped) {
    askForApproval(session, stored, spec)
    return 'continue'
  }
  return runStep(session, stored, spec)
}

/** The run to go on with, or how a run that already ended was answered (`true`: it ended well). */
type Started = { stored: StoredRun } | { ended: boolean }

/**
 * What a stream starts with: the steps stored so far for a stream that attaches later, then the
 * run starts. A run that already ended is answered at once (the boolean says how it ended).
 */
function begin(session: Session, stored: StoredRun, isReplay: boolean): Started {
  session.write({ type: 'start', messageId: session.runId })
  session.write({ type: 'start-step' })
  if (isReplay) for (const step of stored.steps) session.write(stepEvent(step))
  if (stored.run.status === 'queued') {
    const running = setStatus(stored, 'running')
    session.write(runEvent(running))
    return { stored: running }
  }
  return stored.run.canCancel ? { stored } : { ended: replayEnded(session, stored) }
}

/**
 * The run's steps are stored one by one while a client reads the stream; a stream that attaches
 * later (`isReplay`) first gets the steps stored so far, and a run that waits goes on from there.
 */
async function drive(
  runId: string,
  write: (chunk: StreamChunk) => void,
  isAborted: () => boolean,
  isReplay: boolean,
): Promise<boolean> {
  const startedIn = generation
  const session: Session = { runId, write, stop: () => isAborted() || startedIn !== generation }
  const first = runs.get(runId)
  if (!first) return true
  const started = begin(session, first, isReplay)
  if ('ended' in started) return started.ended
  let { stored } = started

  for (;;) {
    stored = reload(session, stored)
    const isDone = stored.steps.length >= stored.specs.length && stored.approvalId === null
    if (session.stop() || stored.run.status === 'canceled') return true
    if (isDone) break
    const outcome = await advance(session, stored)
    if (outcome === 'failed') return false
    if (outcome === 'over') return true
  }
  finishRun(session, reload(session, stored))
  return true
}

/** Waits until the approval is decided; null when the reader left or the mock was reset. */
async function waitForApproval(approvalId: string, stop: () => boolean) {
  while (!stop()) {
    const approval = findApproval(approvalId)
    if (approval?.status === 'approved') return approval
    await sleep(Math.max(streamDelayMs, 5))
  }
  return null
}

// ── Handlers ─────────────────────────────────────────────────────────────────────────────────────

const path = '/orgs/:orgId'
const runNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_RUN_NOT_FOUND, 'Run not found')
const agentNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, 'Agent not found')

/**
 * Agent runs (the editor's Test and Runs tabs; Insights › Runs reads the same endpoints). A test
 * run follows what the last message says: "refund" asks for an approval and waits for it, "broken"
 * or "arrive" fails a tool call (Retry step then reuses the earlier steps), anything else answers.
 * Scenarios: `error` fails a read or a start.
 */
export const agentRunsDomain = defineMockDomain('agentRuns', [
  defineMockHandler({
    method: 'get',
    path: `${path}/agents/:agentId/runs`,
    response: pageResponse(agentRunDtoSchema),
    scenarios: {
      default: ({ params, request }) => {
        if (!lookupAgent(String(params.agentId))) return agentNotFound()
        const query = listAgentRunsQuerySchema.parse(
          Object.fromEntries(new URL(request.url).searchParams),
        )
        const wanted = [...allRuns().values()]
          .map(({ run }) => run)
          .filter((run) => run.agent?.id === params.agentId)
          .filter((run) => (query.isTest ? run.isTest : !run.isTest))
          .filter((run) => (query.status ? query.status.includes(run.status) : true))
          .filter((run) => (query.neededHuman ? run.neededHuman : true))
          .filter((run) => {
            const needle = query.q?.toLowerCase()
            return needle
              ? run.id.includes(needle) ||
                  (run.startedBy?.name.toLowerCase().includes(needle) ?? false)
              : true
          })
          .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
        const start = Number(query.cursor ?? 0)
        const { limit } = query
        const next = start + limit < wanted.length ? String(start + limit) : null
        return mockPage(
          wanted.slice(start, start + limit).map((run) => agentRunDtoSchema.parse(run)),
          next,
        )
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/agents/:agentId/test-runs`,
    response: okResponse(agentRunDetailDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const agent = lookupAgent(String(params.agentId))
        if (!agent) return agentNotFound()
        const { messages } = startTestRunInputSchema.parse(await request.json())
        const plan = planOf(messages)
        const specs = specsFor(plan)
        const run = newRun(agent, {})
        const stored = save({
          run,
          steps: [],
          plan,
          specs,
          messages,
          approvalId: null,
        })
        const wantsStream = new URL(request.url).searchParams.get('stream') === 'true'
        if (!wantsStream) return mockOk(detailOf(stored))
        return sseResponse(request.signal, (write, isAborted) =>
          drive(run.id, write, isAborted, false),
        )
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/runs/:runId`,
    response: okResponse(agentRunDetailDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const stored = allRuns().get(String(params.runId))
        return stored ? mockOk(detailOf(stored)) : runNotFound()
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/runs/:runId/steps`,
    response: okResponse(agentRunStepsDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const stored = allRuns().get(String(params.runId))
        if (!stored) return runNotFound()
        return mockOk({
          items: stored.steps.map(({ input: _input, output: _output, ...row }) => row),
          stepsExpired: false,
        })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/runs/:runId/steps/:seq`,
    response: okResponse(agentRunStepDetailDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const stored = allRuns().get(String(params.runId))
        if (!stored) return runNotFound()
        const step = stored.steps.find(({ seq }) => seq === Number(params.seq))
        return step
          ? mockOk(step)
          : mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_RUN_STEP_NOT_FOUND, 'Step not found')
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/runs/:runId/events`,
    response: okResponse(agentRunDetailDtoSchema),
    scenarios: {
      default: ({ params, request }) => {
        const stored = allRuns().get(String(params.runId))
        if (!stored) return runNotFound()
        return sseResponse(request.signal, (write, isAborted) =>
          drive(stored.run.id, write, isAborted, true),
        )
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/runs/:runId/cancel`,
    response: okResponse(agentRunDetailDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const stored = allRuns().get(String(params.runId))
        if (!stored) return runNotFound()
        if (!stored.run.canCancel) {
          return mockError(
            HTTP_CONFLICT,
            ERROR_CODES.AGENT_RUN_NOT_RETRYABLE,
            'The run already ended',
          )
        }
        return mockOk(detailOf(setStatus(stored, 'canceled')))
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/runs/:runId/retry`,
    response: okResponse(agentRunDetailDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const earlier = allRuns().get(String(params.runId))
        if (!earlier) return runNotFound()
        const input = retryAgentRunInputSchema.parse(await request.json())
        const failed = earlier.steps.find(
          (step) => step.status === 'failed' && step.type === 'tool',
        )
        if (!earlier.run.canRetry || (input.fromFailedStep && (!failed || !earlier.run.isTest))) {
          return mockError(
            HTTP_CONFLICT,
            ERROR_CODES.AGENT_RUN_NOT_RETRYABLE,
            'This run cannot be retried',
          )
        }
        const agent = earlier.run.agent && lookupAgent(earlier.run.agent.id)
        if (!agent) return agentNotFound()
        const skipBefore = input.fromFailedStep && failed ? failed.seq - 1 : 0
        const retried = save({
          run: newRun(agent, {
            isTest: earlier.run.isTest,
            trigger: earlier.run.trigger,
            agentVersion: earlier.run.agentVersion,
            retryOf: { runId: earlier.run.id, seq: failed?.seq ?? null },
          }),
          steps: [],
          plan: earlier.plan,
          specs: specsFor(earlier.plan, { fails: false, skipBefore }),
          messages: earlier.messages,
          approvalId: null,
        })
        return mockOk(detailOf(retried))
      },
    },
  }),
])
