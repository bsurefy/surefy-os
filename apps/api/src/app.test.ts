// SPDX-License-Identifier: AGPL-3.0-only
import { afterAll, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

describe('health', () => {
  const appPromise = buildApp({ logLevel: 'silent' })
  afterAll(async () => {
    await (await appPromise).close()
  })

  it('answers /health/live with the data envelope', async () => {
    const response = await (await appPromise).inject({ method: 'GET', url: '/health/live' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: { status: 'ok' } })
  })

  it('answers unknown routes with 404', async () => {
    const response = await (await appPromise).inject({ method: 'GET', url: '/nope' })
    expect(response.statusCode).toBe(404)
  })
})
