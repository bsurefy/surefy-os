// SPDX-License-Identifier: AGPL-3.0-only
import { orgKey } from '@/core/cache/keys.js'

import { ChannelRateLimitedError } from './agentPublishing.errors.js'

import type { Cache } from '@/core/cache/index.js'

export interface RateWindow {
  /** The counter's name inside the organization: the channel, and the visitor for a widget. */
  scope: readonly (string | number)[]
  perMinute: number
  message: string
}

/**
 * Fixed one-minute windows in Redis, shared by every API replica. Past the limit the call is
 * refused with the seconds until the next window opens. Redis down: the limit is skipped, and the
 * call is not refused for it.
 */
export class RateWindows {
  constructor(
    private readonly cache: Pick<Cache, 'client'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async hit(orgId: string, window: RateWindow): Promise<void> {
    const at = this.now().getTime()
    const minute = Math.floor(at / 60_000)
    const key = orgKey(orgId, ...window.scope, 'rate', minute)
    let count: number
    try {
      count = await this.cache.client.incr(key)
      if (count === 1) await this.cache.client.expire(key, 120)
    } catch {
      return
    }
    if (count > window.perMinute) {
      const retryAfter = Math.max(1, Math.ceil(((minute + 1) * 60_000 - at) / 1000))
      throw new ChannelRateLimitedError(retryAfter, window.message, window.perMinute)
    }
  }
}
