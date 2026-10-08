// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { agentTemplateListDtoSchema, ERROR_CODES } from '@surefy/contracts'

import { expectData, expectError, request } from '../../../../test/helpers/request.js'
import { setupAgents } from '../../agents/__tests__/agentsTestKit.js'

describe('GET /agents/templates', () => {
  it('lists the templates for a Builder, with the model they may use', async () => {
    const setup = await setupAgents()
    const list = expectData(
      await setup.call('bella', 'GET', '/templates'),
      200,
      agentTemplateListDtoSchema,
    )
    expect(list.items.map((item) => item.key)).toEqual([
      'customer_support',
      'hr_helper',
      'sales_assistant',
      'invoice_checker',
    ])
    // the test model is not one a template recommends
    expect(list.items.every((item) => item.suggestedModel === null)).toBe(true)
  })

  it('is for people who build, and for their own organization', async () => {
    const setup = await setupAgents()
    expectError(await setup.call('uma', 'GET', '/templates'), 403, ERROR_CODES.ACCESS_FORBIDDEN)
    const intruder = await request(
      setup.app,
      'GET',
      `/api/v1/orgs/${setup.a.id}/agents/templates`,
      { headers: setup.sessionOf(setup.b.members.bea) },
    )
    expect(intruder.statusCode).toBe(404)
  })
})
