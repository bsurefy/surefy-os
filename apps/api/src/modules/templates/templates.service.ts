// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { AGENT_DEFINITION_VERSION } from '@surefy/contracts'
import type {
  AgentDefinition,
  AgentTemplateDto,
  AgentTemplateKey,
  AgentTemplateListDto,
  AgentTemplateToolDto,
  AgentTool,
} from '@surefy/contracts'

import { TEMPLATES } from './templates.definitions.js'
import { AgentTemplateNotFoundError } from './templates.errors.js'

import type { TemplateSpec, TemplateToolSpec } from './templates.definitions.js'
import type { TemplateBridges, TemplateModels, TemplatesContext } from './templates.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'

export interface TemplatesServiceDeps {
  db: Database
  models: TemplateModels
  bridges: TemplateBridges
}

/** A tool id that stays the same across releases, in the form of a version 8 UUID. */
export function templateToolId(templateKey: string, slug: string): string {
  const hex = createHash('sha256').update(`${templateKey}:${slug}`).digest('hex')
  const variant = '89ab'[Number.parseInt(hex.slice(16, 17), 16) % 4] ?? '8'
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const bridgeKeysOf = (spec: TemplateSpec): string[] => [
  ...new Set(spec.tools.flatMap((tool) => (tool.kind === 'bridge_action' ? [tool.bridgeKey] : []))),
]

/**
 * The agent templates (design/workspace/agents.md › Templates): the list the "New agent" dialog
 * shows, and the definition an agent starts from. Code only; nothing is stored.
 */
export class TemplatesService {
  constructor(private readonly deps: TemplatesServiceDeps) {}

  async list(ctx: TemplatesContext): Promise<AgentTemplateListDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      // one transaction runs one query at a time
      const installed = await this.deps.bridges.installed(tx, ctx.orgId, [
        ...new Set(TEMPLATES.flatMap(bridgeKeysOf)),
      ])
      const allowed = await this.deps.models.allowedFor(tx, ctx)
      return {
        items: TEMPLATES.map((spec): AgentTemplateDto => {
          const definition = this.contentOf(spec, installed)
          return {
            key: spec.key,
            name: spec.name,
            description: spec.description,
            tools: spec.tools.map((tool) => toolDto(tool, installed)),
            knowledgeSuggestion: spec.knowledgeSuggestion,
            guardRules: [...spec.guardLines],
            suggestedModel:
              spec.preferredModelKeys
                .map((key) => allowed.find((candidate) => candidate.modelKey === key))
                .find((candidate) => candidate !== undefined) ?? null,
            definition,
          }
        }),
      }
    })
  }

  /** The definition of a new agent from a template, on the given model. */
  async definitionFor(
    tx: DbExecutor,
    orgId: string,
    key: AgentTemplateKey,
    modelKey: string,
  ): Promise<AgentDefinition> {
    const spec = TEMPLATES.find((candidate) => candidate.key === key)
    if (spec === undefined) throw new AgentTemplateNotFoundError()
    const installed = await this.deps.bridges.installed(tx, orgId, bridgeKeysOf(spec))
    return this.definitionOf(spec, installed, modelKey)
  }

  /** The model keys a template recommends, best first. */
  preferredModelKeys(key: AgentTemplateKey): readonly string[] {
    return TEMPLATES.find((candidate) => candidate.key === key)?.preferredModelKeys ?? []
  }

  /** The definition of a new agent: the template's content on `modelKey`. */
  private definitionOf(
    spec: TemplateSpec,
    installed: ReadonlyMap<string, { bridgeId: string }>,
    modelKey: string,
  ): AgentDefinition {
    return {
      ...this.contentOf(spec, installed),
      model: {
        modelKey,
        creativity: spec.creativity,
        doubleCheckModelKey: null,
        useVaultFallback: true,
      },
    }
  }

  /** What a template sets up apart from the model: bridge tools only for installed bridges. */
  private contentOf(
    spec: TemplateSpec,
    installed: ReadonlyMap<string, { bridgeId: string }>,
  ): Omit<AgentDefinition, 'model'> {
    const tools = spec.tools.flatMap((tool): AgentTool[] => {
      const base = {
        id: templateToolId(spec.key, tool.slug),
        name: tool.name,
        description: tool.description,
        permission: tool.permission,
        enabled: true,
      }
      if (tool.kind === 'web_search') return [{ ...base, kind: 'web_search' }]
      const bridge = installed.get(tool.bridgeKey)
      return bridge === undefined
        ? []
        : [
            {
              ...base,
              kind: 'bridge_action',
              bridgeId: bridge.bridgeId,
              actionName: tool.actionName,
              connectionId: null,
            },
          ]
    })
    return {
      version: AGENT_DEFINITION_VERSION,
      instructions: spec.instructions,
      tone: spec.tone,
      conversationStarters: [...spec.conversationStarters],
      tools,
      knowledge: { knowledgeBaseIds: [], citeSources: true, onlyFromKnowledge: false },
      guard: {
        thresholds: null,
        approvalRules: spec.guard.approvalRules.map((rule) => ({ ...rule })),
        actionLimits: [],
        blockedActions: spec.guard.blockedActions.map((rule) => ({ ...rule })),
      },
    }
  }
}

function toolDto(
  tool: TemplateToolSpec,
  installed: ReadonlyMap<string, { bridgeId: string }>,
): AgentTemplateToolDto {
  if (tool.kind === 'web_search') {
    return {
      name: tool.name,
      kind: 'web_search',
      permission: tool.permission,
      setup: 'ready',
      bridgeKey: null,
    }
  }
  return {
    name: tool.name,
    kind: 'bridge_action',
    permission: tool.permission,
    setup: installed.has(tool.bridgeKey) ? 'needs_connection' : 'bridge_not_installed',
    bridgeKey: tool.bridgeKey,
  }
}
