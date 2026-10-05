// SPDX-License-Identifier: AGPL-3.0-only
import type { OutboxPayload, OutboxTopic } from './outbox.topics.js'

/** One relayed event as a handler receives it. */
export interface OutboxDelivery<T extends OutboxTopic = OutboxTopic> {
  /** The `outbox_events` id. */
  eventId: string
  /** Null only for install-wide events. */
  orgId: string | null
  topic: T
  payload: OutboxPayload<T>
}

/**
 * What a module (or an extension, through `onEvent`) does with one topic. Delivery is at least
 * once and unordered: a handler loads the current state and acts idempotently.
 */
export interface OutboxHandler<T extends OutboxTopic = OutboxTopic> {
  topic: T
  /** Names the handler in logs. */
  name: string
  handle(delivery: OutboxDelivery<T>): Promise<void>
}

/** Declares a handler with its payload typed by the topic. */
export function outboxHandler<T extends OutboxTopic>(
  topic: T,
  name: string,
  handle: (delivery: OutboxDelivery<T>) => Promise<void>,
): OutboxHandler {
  return { topic, name, handle } // `handle` is a method: its narrower payload type is accepted
}

/** An event a service writes in its business transaction. */
export interface OutboxEventInput<T extends OutboxTopic = OutboxTopic> {
  /** Null only for install-wide events, under system scope. */
  orgId: string | null
  topic: T
  payload: OutboxPayload<T>
  /** For events that may be written twice; a second write with the same key is ignored. */
  dedupeKey?: string
  /** Not relayed before this time. */
  availableAt?: Date
  requestId?: string
}

/** A pending row the relay claimed. */
export interface ClaimedOutboxEvent {
  id: string
  organizationId: string | null
  topic: string
  payload: Record<string, unknown>
  attempts: number
}
