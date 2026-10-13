// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { orgKey } from '@/core/cache/keys.js'
import { ConflictError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

import { IDEMPOTENCY_TTL_SECONDS } from './agentPublishing.constants.js'

import type { Cache } from '@/core/cache/index.js'

class IdempotencyKeyReusedError extends ConflictError {
  constructor(message: string) {
    super(ERROR_CODES.IDEMPOTENCY_KEY_REUSED, message)
  }
}

interface Stored {
  /** Hash of the request body: the same key with another body is a mistake. */
  hash: string
  /** The resource the first call created; absent while that call is still running. */
  resourceId?: string
}

export type IdempotentStart =
  | { kind: 'first'; release: () => Promise<void>; finish: (resourceId: string) => Promise<void> }
  | { kind: 'repeat'; resourceId: string }

const hashOf = (body: unknown): string =>
  createHash('sha256').update(JSON.stringify(body)).digest('hex')

/**
 * `Idempotency-Key` for POST endpoints that start work (api.md, §6): the key is scoped to the
 * organization and the actor, kept for 24 hours with a hash of the body. A repeat returns the
 * resource of the first call; another body, or a repeat while the first call runs, is a conflict.
 * Failed calls store nothing, so they can be retried with the same key.
 */
export class Idempotency {
  constructor(private readonly cache: Pick<Cache, 'client'>) {}

  async begin(
    orgId: string,
    actorId: string,
    key: string,
    body: unknown,
  ): Promise<IdempotentStart> {
    const redisKey = orgKey(orgId, 'idem', actorId, key)
    const hash = hashOf(body)
    const client = this.cache.client
    const claimed = await client.set(
      redisKey,
      JSON.stringify({ hash } satisfies Stored),
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX',
    )
    if (claimed === 'OK') {
      return {
        kind: 'first',
        release: async () => {
          await client.del(redisKey)
        },
        finish: async (resourceId) => {
          await client.set(
            redisKey,
            JSON.stringify({ hash, resourceId } satisfies Stored),
            'EX',
            IDEMPOTENCY_TTL_SECONDS,
          )
        },
      }
    }
    const raw = await client.get(redisKey)
    const stored = raw === null ? undefined : (JSON.parse(raw) as Stored)
    if (stored === undefined) {
      // the key expired between the two commands: the caller may simply send it again
      throw new IdempotencyKeyReusedError('Try the request again')
    }
    if (stored.hash !== hash) {
      throw new IdempotencyKeyReusedError('This Idempotency-Key was used with another request')
    }
    if (stored.resourceId === undefined) {
      throw new IdempotencyKeyReusedError('A request with this Idempotency-Key is still running')
    }
    return { kind: 'repeat', resourceId: stored.resourceId }
  }
}
