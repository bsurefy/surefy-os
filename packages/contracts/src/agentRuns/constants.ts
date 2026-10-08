// SPDX-License-Identifier: AGPL-3.0-only

// The run engine's limits (backend/agent-runs.md §1, §8, §9). The executor, the sweeper and the
// event stream all read them from here.

/** Longest stretch of active execution; a resume after an approval starts a new stretch. */
export const AGENT_RUN_MAX_SECONDS = 900
/** Model calls in one run; the next one fails the run with `AGENT_RUN_TURN_LIMIT`. */
export const AGENT_RUN_MAX_TURNS = 25
/** Tool calls the model may request in one turn; extra calls are rejected back to the model. */
export const AGENT_RUN_MAX_TOOL_CALLS = 8
/** One tool call, including the safe outbound fetch. */
export const AGENT_TOOL_TIMEOUT_MS = 30_000
/** Heartbeat while executing; it also notices a cancel. */
export const AGENT_RUN_HEARTBEAT_MS = 10_000
/** A `queued` or `running` run without a heartbeat for this long is picked up by the sweeper. */
export const AGENT_RUN_STALE_MINUTES = 10

/** Step input and output are truncated above this size, with `truncated: true`. */
export const AGENT_RUN_STEP_DATA_MAX_BYTES = 65_536
/** Step rows are dropped with their monthly partition after this many days; the run row stays. */
export const AGENT_RUN_STEP_RETENTION_DAYS = 90

/** The Redis stream behind the event endpoint expires this long after its last event. */
export const AGENT_RUN_EVENT_TTL_SECONDS = 3600
/** Approximate length the stream is trimmed to. */
export const AGENT_RUN_EVENT_MAX_LENGTH = 5000
/** Text deltas are coalesced to at most this many events a second. */
export const AGENT_RUN_TEXT_EVENTS_PER_SECOND = 20
/** A comment line keeps proxies from closing an idle stream. */
export const AGENT_RUN_KEEP_ALIVE_SECONDS = 15
/** A stream of a run that waits for an approval stays open this long, then ends; clients reconnect. */
export const AGENT_RUN_WAITING_STREAM_MINUTES = 10
