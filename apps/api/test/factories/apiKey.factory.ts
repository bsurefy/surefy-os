// SPDX-License-Identifier: AGPL-3.0-only
import { apiKeys } from '@/database/tables/index.js'
import { hashApiKey } from '@/modules/apiKeys/apiKeys.utils.js'
import { PERMISSIONS } from '@surefy/contracts'

import { newId, testApiKeyToken } from './values.js'
import { TEST_API_HOST, type AuthHeaders } from '../helpers/auth.js'

import type { Container } from '@/container.js'

export interface SeedApiKeyOptions {
  name?: string
  scopes?: string[]
  /** `revoked` clears the hash, as a revoke does. */
  status?: 'active' | 'revoked'
  expiresAt?: Date | null
  createdByUserId?: string | null
}

export interface SeededApiKey {
  id: string
  /** The plain key; the table holds only its hash. */
  token: string
  /** `Authorization: Bearer` on the public API host. */
  headers: AuthHeaders
}

let sequence = 0

/** An API key of an organization, written as a fixture (the product creates keys through the API). */
export async function seedApiKey(
  container: Pick<Container, 'db'>,
  orgId: string,
  options: SeedApiKeyOptions = {},
): Promise<SeededApiKey> {
  sequence += 1
  const token = testApiKeyToken(sequence)
  const isRevoked = options.status === 'revoked'
  const id = newId()
  await container.db.tenant(orgId, (tx) =>
    tx.insert(apiKeys).values({
      id,
      organizationId: orgId,
      name: options.name ?? `Key ${sequence}`,
      keyPrefix: token.slice(0, 11),
      keyHash: isRevoked ? null : hashApiKey(token),
      scopes: options.scopes ?? [PERMISSIONS.AGENTS_INVOKE],
      status: isRevoked ? 'revoked' : 'active',
      expiresAt: options.expiresAt ?? null,
      revokedAt: isRevoked ? new Date() : null,
      createdByUserId: options.createdByUserId ?? null,
    }),
  )
  return { id, token, headers: { authorization: `Bearer ${token}`, host: TEST_API_HOST } }
}
