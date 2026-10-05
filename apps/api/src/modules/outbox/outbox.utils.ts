// SPDX-License-Identifier: AGPL-3.0-only
import { OUTBOX_RETRY_BASE_MS, OUTBOX_RETRY_MAX_MS } from './outbox.constants.js'

/** The delay before the next relay of a row whose enqueue failed `attempts` times (1 or more). */
export const relayRetryDelayMs = (attempts: number): number =>
  Math.min(OUTBOX_RETRY_BASE_MS * 2 ** attempts, OUTBOX_RETRY_MAX_MS)

/** The deterministic BullMQ job id of an event: a re-relayed row never adds a second job. */
export const outboxJobId = (eventId: string): string => `outbox-${eventId}`

/** `last_error`: the error's code or name and a short message, never payload data. */
export function relayErrorText(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN'
  const code = (error as { code?: unknown }).code
  const label = typeof code === 'string' ? code : error.name
  return `${label}: ${error.message}`.slice(0, 500)
}
