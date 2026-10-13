// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  APPROVAL_RISKS,
  APPROVAL_TIMEOUT_ACTIONS,
  APPROVERS_MAX,
  approverSchema,
} from '../approvals/schemas.js'
import { ACTION_LIMIT_REACHED_ACTIONS, guardMatchSchema } from '../guard/guardrails.js'
import { basisPointsSchema } from '../guard/thresholds.js'
import { modelKeySchema } from '../models/keys.js'

// `AgentDefinition` v1: the versioned part of an agent (database/agents-and-runs.md §1). The draft
// holds one, every published version freezes one. Secrets are never inside: tools name Vault
// credentials and connections by id. Name, description and audience are live metadata, not here.

export const AGENT_DEFINITION_VERSION = 1

export const AGENT_INSTRUCTIONS_MAX_LENGTH = 20_000
export const AGENT_CONVERSATION_STARTERS_MAX = 6
export const AGENT_TOOLS_MAX = 50
export const AGENT_KNOWLEDGE_BASES_MAX = 50
export const AGENT_GUARD_RULES_MAX = 50

// ── Tools ───────────────────────────────────────────────────────────────────────────────────────

export const AGENT_TOOL_KINDS = ['bridge_action', 'flow', 'api', 'mcp', 'web_search'] as const
export type AgentToolKind = (typeof AGENT_TOOL_KINDS)[number]

/** Tools default to `read_only`; `can_act` tools that move money or post publicly get an approval rule suggested. */
export const AGENT_TOOL_PERMISSIONS = ['read_only', 'ask_first', 'can_act'] as const
export type AgentToolPermission = (typeof AGENT_TOOL_PERMISSIONS)[number]

export const AGENT_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type AgentHttpMethod = (typeof AGENT_HTTP_METHODS)[number]

export const agentToolPermissionSchema = z.enum(AGENT_TOOL_PERMISSIONS)

const toolBaseShape = {
  /** Stable inside the agent, so a publish diff can name added, removed and changed tools. */
  id: z.uuid(),
  /** What the person and the model call the tool. */
  name: z.string().trim().min(1).max(100),
  /** Tells the model when to use it. */
  description: z.string().max(1000),
  permission: agentToolPermissionSchema,
  enabled: z.boolean(),
} as const

/** A non-secret header; credentials come from the connection. */
export const agentToolHeaderSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Za-z0-9-]+$/)
    .max(100),
  value: z.string().max(1000),
})

export const agentMcpActionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000),
  enabled: z.boolean(),
  /** Null follows the server's own permission. */
  permission: agentToolPermissionSchema.nullable(),
})
export type AgentMcpAction = z.infer<typeof agentMcpActionSchema>

const bridgeActionToolSchema = z.object({
  ...toolBaseShape,
  kind: z.literal('bridge_action'),
  bridgeId: z.uuid(),
  actionName: z.string().min(1).max(200),
  connectionId: z.uuid().nullable(),
})
const flowToolSchema = z.object({ ...toolBaseShape, kind: z.literal('flow'), flowId: z.uuid() })
const apiToolSchema = z.object({
  ...toolBaseShape,
  kind: z.literal('api'),
  method: z.enum(AGENT_HTTP_METHODS),
  url: z.url({ protocol: /^https?$/ }).max(2048),
  headers: z.array(agentToolHeaderSchema).max(20),
  /** JSON Schema of the arguments the model fills in. */
  inputSchema: z.record(z.string(), z.unknown()).nullable(),
  connectionId: z.uuid().nullable(),
})
const mcpToolSchema = z.object({
  ...toolBaseShape,
  kind: z.literal('mcp'),
  serverUrl: z.url({ protocol: /^https?$/ }).max(2048),
  connectionId: z.uuid().nullable(),
  /** Found by connecting to the server; each can be turned off or given its own permission. */
  discoveredActions: z.array(agentMcpActionSchema).max(200),
})
const webSearchToolSchema = z.object({ ...toolBaseShape, kind: z.literal('web_search') })

export const agentToolSchema = z.discriminatedUnion('kind', [
  bridgeActionToolSchema,
  flowToolSchema,
  apiToolSchema,
  mcpToolSchema,
  webSearchToolSchema,
])
export type AgentTool = z.infer<typeof agentToolSchema>

// ── Model, knowledge, Guard ─────────────────────────────────────────────────────────────────────

export const agentModelSchema = z.object({
  /** A Vault model key, or `auto` from V2. */
  modelKey: modelKeySchema,
  /** 0 (precise) to 1 (creative). */
  creativity: z.number().min(0).max(1),
  /** The model that reviews actions in the AI double-check band. */
  doubleCheckModelKey: modelKeySchema.nullable(),
  /** Private conversations fall back to local models only. */
  useVaultFallback: z.boolean(),
})
export type AgentModel = z.infer<typeof agentModelSchema>

export const agentKnowledgeSchema = z.object({
  knowledgeBaseIds: z.array(z.uuid()).max(AGENT_KNOWLEDGE_BASES_MAX),
  citeSources: z.boolean(),
  onlyFromKnowledge: z.boolean(),
})
export type AgentKnowledge = z.infer<typeof agentKnowledgeSchema>

/** Names a rule inside the agent: `ruleRef` is `agent:{agentId}:v{n}:{ruleId}`. */
export const agentGuardRuleIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

const agentApprovalRuleSchema = z
  .object({
    id: agentGuardRuleIdSchema,
    match: guardMatchSchema,
    approvers: z.array(approverSchema).min(1).max(APPROVERS_MAX),
    /** Null waits until decided or canceled. */
    waitMinutes: z.number().int().positive().max(43_200).nullable(),
    /** Required with `waitMinutes`, absent without it. */
    onTimeout: z.enum(APPROVAL_TIMEOUT_ACTIONS).nullable(),
    escalateTo: z.array(approverSchema).max(APPROVERS_MAX).default([]),
    risk: z.enum(APPROVAL_RISKS),
  })
  .refine((rule) => (rule.waitMinutes === null) === (rule.onTimeout === null))

const agentActionLimitSchema = z.object({
  id: agentGuardRuleIdSchema,
  match: guardMatchSchema,
  limit: z
    .object({
      perActionAmountMicros: z.number().int().positive().optional(),
      perDayCount: z.number().int().positive().optional(),
      perDayAmountMicros: z.number().int().positive().optional(),
    })
    .refine(
      (limit) =>
        limit.perActionAmountMicros !== undefined ||
        limit.perDayCount !== undefined ||
        limit.perDayAmountMicros !== undefined,
    ),
  onReached: z.enum(ACTION_LIMIT_REACHED_ACTIONS),
})

const agentBlockedActionSchema = z.object({ id: agentGuardRuleIdSchema, match: guardMatchSchema })

/**
 * The agent-scoped Guard rules. They can be stricter than the organization's, never looser
 * (`guard.assertNotLooser`); `thresholds: null` follows the organization's.
 */
export const agentGuardSchema = z.object({
  thresholds: z.object({ autoBp: basisPointsSchema, reviewBp: basisPointsSchema }).nullable(),
  approvalRules: z.array(agentApprovalRuleSchema).max(AGENT_GUARD_RULES_MAX),
  actionLimits: z.array(agentActionLimitSchema).max(AGENT_GUARD_RULES_MAX),
  blockedActions: z.array(agentBlockedActionSchema).max(AGENT_GUARD_RULES_MAX),
})
export type AgentGuard = z.infer<typeof agentGuardSchema>

// ── The definition ──────────────────────────────────────────────────────────────────────────────

const isUnique = (ids: readonly string[]) => new Set(ids).size === ids.length

/** The plain object, for `omit` and `extend`; use `agentDefinitionSchema` to validate. */
export const agentDefinitionObjectSchema = z.object({
  version: z.literal(AGENT_DEFINITION_VERSION),
  instructions: z.string().max(AGENT_INSTRUCTIONS_MAX_LENGTH),
  tone: z.string().trim().max(200).nullable(),
  conversationStarters: z
    .array(z.string().trim().min(1).max(200))
    .max(AGENT_CONVERSATION_STARTERS_MAX),
  model: agentModelSchema,
  tools: z.array(agentToolSchema).max(AGENT_TOOLS_MAX),
  knowledge: agentKnowledgeSchema,
  guard: agentGuardSchema,
})

export const agentDefinitionSchema = agentDefinitionObjectSchema
  .refine((definition) => isUnique(definition.tools.map((tool) => tool.id)))
  .refine((definition) =>
    isUnique(
      [
        ...definition.guard.approvalRules,
        ...definition.guard.actionLimits,
        ...definition.guard.blockedActions,
      ].map((rule) => rule.id),
    ),
  )
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>

/** A blank agent on `modelKey`: "Start from scratch". */
export function createEmptyAgentDefinition(modelKey: string): AgentDefinition {
  return {
    version: AGENT_DEFINITION_VERSION,
    instructions: '',
    tone: null,
    conversationStarters: [],
    model: { modelKey, creativity: 0.3, doubleCheckModelKey: null, useVaultFallback: true },
    tools: [],
    knowledge: { knowledgeBaseIds: [], citeSources: true, onlyFromKnowledge: false },
    guard: { thresholds: null, approvalRules: [], actionLimits: [], blockedActions: [] },
  }
}

// ── Diff ────────────────────────────────────────────────────────────────────────────────────────

/** The editor tabs a change belongs to. */
export const AGENT_DEFINITION_SECTIONS = [
  'instructions',
  'model',
  'tools',
  'knowledge',
  'guard',
] as const
export type AgentDefinitionSection = (typeof AGENT_DEFINITION_SECTIONS)[number]

export const AGENT_CHANGE_KINDS = ['added', 'removed', 'changed'] as const

/** One line of the diff on Publish and Versions: "Tool Refund API removed", "Creativity 0.3 → 0.5". */
export const agentDefinitionChangeSchema = z.object({
  section: z.enum(AGENT_DEFINITION_SECTIONS),
  kind: z.enum(AGENT_CHANGE_KINDS),
  /** The field or the tool or rule name. */
  label: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
})
export type AgentDefinitionChange = z.infer<typeof agentDefinitionChangeSchema>

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function diffFields(
  section: AgentDefinitionSection,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labelPrefix = '',
): AgentDefinitionChange[] {
  return Object.keys(after)
    .filter((key) => !same(before[key], after[key]))
    .map((key) => ({
      section,
      kind: 'changed' as const,
      label: `${labelPrefix}${key}`,
      before: before[key],
      after: after[key],
    }))
}

function diffById(
  section: AgentDefinitionSection,
  before: readonly { id: string; name?: string }[],
  after: readonly { id: string; name?: string }[],
  labelOf: (item: { id: string; name?: string }) => string,
): AgentDefinitionChange[] {
  const beforeById = new Map(before.map((item) => [item.id, item]))
  const afterById = new Map(after.map((item) => [item.id, item]))
  const added = after
    .filter((item) => !beforeById.has(item.id))
    .map((item) => ({ section, kind: 'added' as const, label: labelOf(item), after: item }))
  const removed = before
    .filter((item) => !afterById.has(item.id))
    .map((item) => ({ section, kind: 'removed' as const, label: labelOf(item), before: item }))
  const changed = after
    .filter((item) => beforeById.has(item.id) && !same(beforeById.get(item.id), item))
    .map((item) => ({
      section,
      kind: 'changed' as const,
      label: labelOf(item),
      before: beforeById.get(item.id),
      after: item,
    }))
  return [...added, ...removed, ...changed]
}

/**
 * What differs between two definitions, grouped by editor tab. The same function runs on the
 * server (Publish and Versions answers) and in the editor (the unpublished-changes count).
 */
export function diffAgentDefinitions(
  before: AgentDefinition,
  after: AgentDefinition,
): AgentDefinitionChange[] {
  const rules = (guard: AgentGuard) => [
    ...guard.approvalRules.map((rule) => ({ ...rule, name: `Approval rule ${rule.match.action}` })),
    ...guard.actionLimits.map((rule) => ({ ...rule, name: `Action limit ${rule.match.action}` })),
    ...guard.blockedActions.map((rule) => ({ ...rule, name: `Blocked ${rule.match.action}` })),
  ]
  return [
    ...diffFields(
      'instructions',
      {
        instructions: before.instructions,
        tone: before.tone,
        conversationStarters: before.conversationStarters,
      },
      {
        instructions: after.instructions,
        tone: after.tone,
        conversationStarters: after.conversationStarters,
      },
    ),
    ...diffFields('model', before.model, after.model),
    ...diffById('tools', before.tools, after.tools, (tool) => tool.name ?? tool.id),
    ...diffFields('knowledge', before.knowledge, after.knowledge),
    ...diffFields(
      'guard',
      { thresholds: before.guard.thresholds },
      { thresholds: after.guard.thresholds },
    ),
    ...diffById('guard', rules(before.guard), rules(after.guard), (rule) => rule.name ?? rule.id),
  ]
}
