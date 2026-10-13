// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  agentDefinitionObjectSchema,
  AGENT_TOOL_KINDS,
  agentToolPermissionSchema,
} from './definition.js'
import { orgParamsSchema } from '../core/params.js'
import { modelRefDtoSchema } from '../models/gateway.js'

// Agent templates are code, not data: the definitions ship with the `templates` module and need no
// tables (product-modules-map). Route, under /api/v1/orgs/:orgId/agents: GET /templates.
// "Start from scratch" is `POST /agents` without a template key.

export const AGENT_TEMPLATE_KEYS = [
  'customer_support',
  'hr_helper',
  'sales_assistant',
  'invoice_checker',
] as const
export type AgentTemplateKey = (typeof AGENT_TEMPLATE_KEYS)[number]
export const agentTemplateKeySchema = z.enum(AGENT_TEMPLATE_KEYS)

export const templatesParamsSchema = orgParamsSchema

/**
 * Whether a tool of the template works for this organization: `needs_connection` tools are marked
 * "Not connected", `bridge_not_installed` ones offer Install or Request install. The agent is
 * created either way.
 */
export const TEMPLATE_TOOL_SETUP_STATES = [
  'ready',
  'needs_connection',
  'bridge_not_installed',
] as const

export const agentTemplateToolDtoSchema = z.object({
  name: z.string(),
  kind: z.enum(AGENT_TOOL_KINDS),
  permission: agentToolPermissionSchema,
  setup: z.enum(TEMPLATE_TOOL_SETUP_STATES),
  /** The bridge a `bridge_action` tool needs. */
  bridgeKey: z.string().nullable(),
})
export type AgentTemplateToolDto = z.infer<typeof agentTemplateToolDtoSchema>

/** A template card: what it sets up, and the definition it starts from (without a model). */
export const agentTemplateDtoSchema = z.object({
  key: agentTemplateKeySchema,
  name: z.string(),
  description: z.string(),
  tools: z.array(agentTemplateToolDtoSchema),
  /** The knowledge the template suggests attaching ("Your support articles"); knowledge is never preselected. */
  knowledgeSuggestion: z.string().nullable(),
  /** One line per Guard rule it sets up ("Refunds over $200 need approval"). */
  guardRules: z.array(z.string()),
  /** The allowed model the template recommends, or null when none fits. */
  suggestedModel: modelRefDtoSchema.nullable(),
  definition: agentDefinitionObjectSchema.omit({ model: true }),
})
export type AgentTemplateDto = z.infer<typeof agentTemplateDtoSchema>

export const agentTemplateListDtoSchema = z.object({ items: z.array(agentTemplateDtoSchema) })
export type AgentTemplateListDto = z.infer<typeof agentTemplateListDtoSchema>
