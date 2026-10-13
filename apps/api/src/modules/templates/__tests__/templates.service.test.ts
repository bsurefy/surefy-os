// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  AGENT_TEMPLATE_KEYS,
  agentDefinitionSchema,
  agentTemplateDtoSchema,
} from '@surefy/contracts'

import { TEMPLATES } from '../templates.definitions.js'
import { AgentTemplateNotFoundError } from '../templates.errors.js'
import { templateToolId, TemplatesService } from '../templates.service.js'
import { NO_BRIDGES, type TemplateBridges, type TemplateModels } from '../templates.types.js'

import type { Database, DbExecutor } from '@/core/database/index.js'

const tx = {} as DbExecutor
const ctx = { orgId: '0198f3a0-0000-7000-8000-000000000001', userId: null, teamIds: [] }

const allBridges: TemplateBridges = {
  installed: (_tx, _orgId, keys) =>
    Promise.resolve(
      new Map(
        keys.map((key, index) => [
          key,
          { bridgeId: `0198f3a0-0000-7000-8000-0000000001${index}0` },
        ]),
      ),
    ),
}

const models = (...keys: string[]): TemplateModels => ({
  allowedFor: () =>
    Promise.resolve(
      keys.map((modelKey) => ({
        modelKey,
        displayName: modelKey,
        providerKey: 'openai',
        source: 'provider' as const,
      })),
    ),
})

const serviceOf = (bridges: TemplateBridges, allowed: TemplateModels) =>
  new TemplatesService({
    db: {
      tenant: (_orgId: string, run: (executor: DbExecutor) => unknown) => run(tx),
    } as unknown as Database,
    bridges,
    models: allowed,
  })

describe('the templates', () => {
  it('has one definition for every key the contract names', () => {
    expect(TEMPLATES.map((template) => template.key)).toEqual([...AGENT_TEMPLATE_KEYS])
  })

  it.each(TEMPLATES.map((template) => template.key))(
    '%s makes a valid agent definition, with and without its bridges installed',
    async (key) => {
      for (const bridges of [NO_BRIDGES, allBridges]) {
        const service = serviceOf(bridges, models())
        const definition = await service.definitionFor(tx, ctx.orgId, key, 'openai/gpt-4.1')
        expect(agentDefinitionSchema.safeParse(definition).success).toBe(true)
        expect(definition.model.modelKey).toBe('openai/gpt-4.1')
        expect(definition.tools.every((tool) => tool.enabled)).toBe(true)
        const tools = new Set(definition.tools.map((tool) => tool.name.toLowerCase()))
        expect(tools.size).toBe(definition.tools.length)
      }
    },
  )

  it('writes its Guard rules against tools the template itself defines', () => {
    for (const template of TEMPLATES) {
      const names = new Set(template.tools.map((tool) => tool.name))
      for (const rule of template.guard.approvalRules) {
        expect(names, `${template.key}: ${rule.match.action}`).toContain(rule.match.action)
      }
      expect(template.guardLines).toHaveLength(template.guard.approvalRules.length)
    }
  })

  it('keeps tool ids the same across calls and distinct between tools', () => {
    expect(templateToolId('hr_helper', 'a')).toBe(templateToolId('hr_helper', 'a'))
    expect(templateToolId('hr_helper', 'a')).not.toBe(templateToolId('hr_helper', 'b'))
    expect(templateToolId('hr_helper', 'a')).not.toBe(templateToolId('sales_assistant', 'a'))
    expect(templateToolId('hr_helper', 'a')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('marks the tools of bridges that are not installed, and suggests an allowed model', async () => {
    const list = await serviceOf(NO_BRIDGES, models('openai/gpt-4.1-mini', 'openai/gpt-4.1')).list({
      ...ctx,
      access: { permissions: [] },
    })
    expect(list.items).toHaveLength(4)
    for (const item of list.items) agentTemplateDtoSchema.parse(item)
    const support = list.items.find((item) => item.key === 'customer_support')
    expect(support?.tools.map((tool) => [tool.name, tool.setup, tool.bridgeKey])).toEqual([
      ['Look up ticket', 'bridge_not_installed', 'zendesk'],
      ['Reply to ticket', 'bridge_not_installed', 'zendesk'],
      ['Issue refund', 'bridge_not_installed', 'stripe'],
    ])
    expect(support?.definition.tools).toEqual([])
    expect(support?.suggestedModel?.modelKey).toBe('openai/gpt-4.1')
    const sales = list.items.find((item) => item.key === 'sales_assistant')
    expect(sales?.tools.find((tool) => tool.kind === 'web_search')?.setup).toBe('ready')
  })

  it('needs a connection for the bridge tools of an installed bridge', async () => {
    const list = await serviceOf(allBridges, models()).list({ ...ctx, access: { permissions: [] } })
    const hr = list.items.find((item) => item.key === 'hr_helper')
    expect(hr?.tools.map((tool) => tool.setup)).toEqual(['needs_connection', 'needs_connection'])
    expect(hr?.definition.tools.map((tool) => tool.kind)).toEqual([
      'bridge_action',
      'bridge_action',
    ])
    expect(hr?.suggestedModel).toBeNull()
  })

  it('refuses a template it does not have', async () => {
    await expect(
      serviceOf(NO_BRIDGES, models()).definitionFor(tx, ctx.orgId, 'nope' as never, 'x'),
    ).rejects.toBeInstanceOf(AgentTemplateNotFoundError)
  })
})
