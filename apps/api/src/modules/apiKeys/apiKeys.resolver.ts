// SPDX-License-Identifier: AGPL-3.0-only
import { API_KEY_SECRET_PATTERN, PERMISSIONS } from '@surefy/contracts'
import type { Permission } from '@surefy/contracts'

import { hashApiKey } from './apiKeys.utils.js'

import type { ApiKeysRepository } from './apiKeys.repository.js'
import type { ApiKeysLastUsed } from './apiKeysLastUsed.js'
import type { Database } from '@/core/database/index.js'
import type { ApiKeyResolver } from '@/plugins/session.plugin.js'
import type { ActorContext } from '@/types/context.js'
import type { FastifyRequest } from 'fastify'

export interface ApiKeyAuthenticatorDeps {
  db: Database
  repository: ApiKeysRepository
  lastUsed: ApiKeysLastUsed
  /** The host of `API_PUBLIC_URL`: the only host that accepts a key. */
  publicApiHost: string
}

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(Object.values(PERMISSIONS))

/**
 * `Authorization: Bearer sk_…` → the key's actor (authentication.md, §6). Anything that does not
 * resolve, whatever the reason (unknown, revoked, expired, another host, a suspended organization),
 * is the same `null`: the access plugin answers `401 AUTH_UNAUTHENTICATED`.
 */
export class ApiKeyAuthenticator implements ApiKeyResolver {
  constructor(private readonly deps: ApiKeyAuthenticatorDeps) {}

  async resolve(token: string, request: FastifyRequest): Promise<ActorContext | null> {
    if (request.host !== this.deps.publicApiHost) return null
    if (!API_KEY_SECRET_PATTERN.test(token)) return null
    const key = await this.deps.repository.resolve(this.deps.db.global, hashApiKey(token))
    if (key === undefined) return null
    // `lastUsed` buffers in the background; the call does not wait for Redis
    void this.deps.lastUsed.record(key.orgId, key.keyId, request.ip)
    return {
      userId: null,
      requestId: request.id,
      via: 'api-key',
      apiKey: {
        id: key.keyId,
        orgId: key.orgId,
        permissions: key.scopes.filter((scope): scope is Permission =>
          KNOWN_PERMISSIONS.has(scope),
        ),
      },
      ip: request.ip,
      ...(request.headers['user-agent'] === undefined
        ? {}
        : { userAgent: request.headers['user-agent'] }),
    }
  }
}
