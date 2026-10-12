// SPDX-License-Identifier: AGPL-3.0-only

/** Calls a minute an API channel accepts until an Admin sets its own limit. */
export const API_CHANNEL_DEFAULT_RATE_PER_MINUTE = 60

/** How long an `Idempotency-Key` keeps its run (api.md, §6). */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60

/** Messages a minute one widget channel accepts from all its visitors together. */
export const WIDGET_CHANNEL_MESSAGES_PER_MINUTE = 60

/** Messages a minute one visitor (one address) may send through a widget. */
export const WIDGET_VISITOR_MESSAGES_PER_MINUTE = 10

/** How long a widget run stays tied to the conversation that started it, for reattaching. */
export const WIDGET_RUN_BINDING_TTL_SECONDS = 7 * 24 * 60 * 60

/** `last_active_at` is written at most once in this many seconds per channel. */
export const CHANNEL_ACTIVITY_INTERVAL_SECONDS = 60
