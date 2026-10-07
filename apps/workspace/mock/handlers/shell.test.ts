// SPDX-License-Identifier: AGPL-3.0-only
import { getResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { meDtoSchema, effectiveAccessDtoSchema, okResponse } from '@surefy/contracts'

import { accessDomain } from './access'
import { meDomain } from './me'
import { ACME_ORG } from './shell.fixtures'

const API = 'http://localhost:4000/api/v1'

async function get(handlers: typeof meDomain.handlers, path: string, scenario: string) {
  const request = new Request(`${API}${path}?scenario=${scenario}`)
  const response = await getResponse([...handlers], request)
  if (!response) throw new Error(`No handler for ${path}`)
  return response
}

describe('the shell mock domains', () => {
  it.each(['default', 'multi-org', 'cloud', 'support-access', 'error', 'offline', 'forbidden'])(
    'answers GET /me with a valid session for %s, keeping the shell up',
    async (scenario) => {
      const response = await get(meDomain.handlers, '/me', scenario)
      expect(response.status).toBe(200)
      expect(okResponse(meDtoSchema).safeParse(await response.json()).success).toBe(true)
    },
  )

  it.each(['default', 'role-user', 'role-builder', 'role-admin', 'enterprise', 'error'])(
    'answers effective access for %s',
    async (scenario) => {
      const response = await get(accessDomain.handlers, `/orgs/${ACME_ORG.id}/access/me`, scenario)
      expect(response.status).toBe(200)
      expect(okResponse(effectiveAccessDtoSchema).safeParse(await response.json()).success).toBe(
        true,
      )
    },
  )

  it('takes notifications away from a User in the forbidden scenario', async () => {
    const response = await get(accessDomain.handlers, `/orgs/${ACME_ORG.id}/access/me`, 'forbidden')
    const { data } = okResponse(effectiveAccessDtoSchema).parse(await response.json())
    expect(data.role).toBe('user')
    expect(data.permissions).not.toContain('notifications:read')
  })
})
