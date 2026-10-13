// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { newPkce, OauthStateStore, type OauthSession } from '../connectionsOauthState.js'

const session: OauthSession = {
  orgId: '0198a000-0000-7000-8000-000000000001',
  userId: '0198a000-0000-7000-8000-000000000002',
  providerKey: 'google-drive',
  scope: 'organization',
  scopes: ['drive.readonly'],
  redirectUri: 'https://app.example.test/settings/connections/callback',
  codeVerifier: 'verifier',
}

/** The two Redis commands the store uses, over a map. */
const fakeClient = () => {
  const data = new Map<string, { value: string; ttl: number }>()
  return {
    data,
    set: (key: string, value: string, _mode: 'EX', ttl: number) => {
      data.set(key, { value, ttl })
      return Promise.resolve('OK' as const)
    },
    getdel: (key: string) => {
      const found = data.get(key)
      data.delete(key)
      return Promise.resolve(found?.value ?? null)
    },
  }
}

describe('PKCE', () => {
  it('derives the challenge from the verifier with S256, and never repeats', () => {
    const first = newPkce()
    expect(first.challenge).toBe(createHash('sha256').update(first.verifier).digest('base64url'))
    expect(first.verifier.length).toBeGreaterThanOrEqual(43)
    expect(newPkce().verifier).not.toBe(first.verifier)
  })
})

describe('started sign-ins', () => {
  it('keeps one for ten minutes and hands it out once', async () => {
    const client = fakeClient()
    const store = new OauthStateStore(client as never)
    const { state, expiresAt } = await store.create(session)
    expect(state.length).toBeGreaterThanOrEqual(43)
    expect([...client.data.values()][0]?.ttl).toBe(600)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000)
    expect(await store.take(state)).toEqual(session)
    expect(await store.take(state)).toBeNull()
    expect(await store.take('unknown')).toBeNull()
  })
})
