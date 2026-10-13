// SPDX-License-Identifier: AGPL-3.0-only
import { agents } from '@/database/tables/index.js'
import { createEmptyAgentDefinition } from '@surefy/contracts'

import { defineTableFactory } from './defineFactory.js'
import { newId } from './values.js'

import type { Container } from '@/container.js'

/** A draft agent with a blank definition; give it the organization and, if it matters, an owner. */
export const agentFactory = defineTableFactory(agents, (seq) => ({
  id: newId(),
  organizationId: newId(),
  name: `Agent ${seq}`,
  draftDefinition: createEmptyAgentDefinition('openai/gpt-4.1'),
}))

/** An agent row of an organization, written as a fixture (the product creates them through the API). */
export function seedAgent(
  container: Pick<Container, 'db'>,
  orgId: string,
  overrides: Partial<typeof agents.$inferInsert> = {},
) {
  return container.db.tenant(orgId, (tx) =>
    agentFactory.create(tx, { organizationId: orgId, ...overrides }),
  )
}
