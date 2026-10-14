// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ApprovalAssigneeDto,
  ChatAgentRefDto,
  ChatDto,
  ChatMessageDto,
  ChatMessagePart,
} from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'

import { usableAgents } from './agents'
import { addApproval } from './approvals'
import { approvalFactory } from './approvals.fixtures'

import type { StreamChunk } from './runStream'

/** Ids of the runs and approvals agent chats start in the mock. */
const AGENT_CHAT_RUN_KIND = 76
const AGENT_CHAT_APPROVAL_KIND = 77
const APPROVAL_HOURS = 24
const HOUR_MS = 3_600_000

const FINANCE: ApprovalAssigneeDto = {
  subjectType: 'team',
  user: null,
  team: { id: fixtureUuid(AGENT_CHAT_APPROVAL_KIND + 1, 1), name: 'Finance' },
  role: null,
  source: 'rule',
}

let runOrdinal = 0

export function resetAgentChatsMock(): void {
  runOrdinal = 0
}

/** The agent a new chat talks to, when the person may use it. */
export function agentRefOf(agentId: string): ChatAgentRefDto | null {
  const agent = usableAgents().find((candidate) => candidate.id === agentId)
  return agent ? { id: agent.id, name: agent.name, isAvailable: true } : null
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export interface AgentAnswerContext {
  chat: ChatDto
  assistantId: string
  userMessageId: string | null
  prompt: string
  isNewChat: boolean
  delayMs: number
  /** Stores the answer as the run left it. */
  persist: (
    parts: ChatMessagePart[],
    status: ChatMessageDto['status'],
    agentRunId: string,
    streamed: string,
  ) => void
}

/**
 * An agent chat's answer: the run's event stream (agentRuns/stream.ts) with the chat chunks. The
 * agent looks the order up; a message about a refund stops at an approval, so the answer stays
 * `streaming` with the approval card until the run goes on.
 */
export async function streamAgentAnswer(
  context: AgentAnswerContext,
  write: (chunk: StreamChunk) => void,
  isAborted: () => boolean,
): Promise<boolean> {
  const { chat, assistantId, prompt } = context
  const runId = fixtureUuid(AGENT_CHAT_RUN_KIND, ++runOrdinal)
  const needsApproval = prompt.toLowerCase().includes('refund')
  write({ type: 'start', messageId: assistantId })
  write({
    type: 'data-message',
    data: { userMessageId: context.userMessageId, assistantMessageId: assistantId },
  })
  write({ type: 'data-run', data: { runId, status: 'running', errorCode: null } })
  write({
    type: 'data-model',
    data: {
      model: {
        modelKey: 'openai/gpt-4.1',
        displayName: 'GPT-4.1',
        providerKey: 'openai',
        source: 'provider',
      },
      dataLocation: 'provider',
      piiMasked: false,
      routed: false,
      fallback: null,
    },
  })
  await sleep(context.delayMs * 4)

  const tool: ChatMessagePart = {
    type: 'tool',
    toolCallId: 'call-1',
    toolName: 'lookup_order',
    state: 'done',
    input: { order: '#1001' },
    output: { status: 'delivered', damaged: true },
  }
  write({
    type: 'tool-input-available',
    toolCallId: 'call-1',
    toolName: 'lookup_order',
    input: tool.input,
    dynamic: true,
  })
  write({ type: 'tool-output-available', toolCallId: 'call-1', output: tool.output })

  const text = needsApproval
    ? 'I found order #1001: it arrived damaged. A refund of $42 needs approval first, so I asked for it.'
    : `${chat.agent?.name ?? 'The agent'} looked at your question: “${prompt.slice(0, 80)}”. Order #1001 was delivered on Monday.`
  let streamed = ''
  write({ type: 'text-start', id: 't1' })
  for (const [position, word] of text.split(/(?<=\s)/).entries()) {
    if (isAborted()) break
    write({ type: 'text-delta', id: 't1', delta: word })
    streamed += word
    if (position % 2 === 0) await sleep(context.delayMs)
  }
  write({ type: 'text-end', id: 't1' })
  const parts: ChatMessagePart[] = [tool, { type: 'text', text: streamed }]

  if (isAborted()) {
    context.persist(
      [...parts, { type: 'data', name: 'stopped', data: {} }],
      'stopped',
      runId,
      streamed,
    )
    return true
  }

  if (needsApproval) {
    const approval = approvalFactory({
      id: fixtureUuid(AGENT_CHAT_APPROVAL_KIND, runOrdinal),
      title: 'Refund order #1001',
      agentRunId: runId,
      assignees: [FINANCE],
      expiresAt: new Date(Date.now() + APPROVAL_HOURS * HOUR_MS).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    addApproval(approval)
    write({
      type: 'data-approval-required',
      data: {
        seq: 2,
        approvalId: approval.id,
        title: approval.title,
        assignees: approval.assignees,
        expiresAt: approval.expiresAt,
      },
    })
    write({ type: 'data-run', data: { runId, status: 'waiting_approval', errorCode: null } })
    context.persist(
      [...parts, { type: 'data', name: 'approval', data: { approvalId: approval.id } }],
      'streaming',
      runId,
      streamed,
    )
    // the stream ends after the final `data-run`; the run goes on once the approval is decided
    return true
  }

  write({ type: 'data-run', data: { runId, status: 'succeeded', errorCode: null } })
  if (context.isNewChat) {
    write({ type: 'data-title', data: { title: chat.title || 'New conversation' } })
  }
  write({ type: 'finish' })
  context.persist(parts, 'complete', runId, streamed)
  return true
}
