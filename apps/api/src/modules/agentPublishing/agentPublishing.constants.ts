// SPDX-License-Identifier: AGPL-3.0-only

/** Calls a minute an API channel accepts until an Admin sets its own limit. */
export const API_CHANNEL_DEFAULT_RATE_PER_MINUTE = 60

/** How long an `Idempotency-Key` keeps its run (api.md, §6). */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60
