// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The scenarios every mock handler supports without defining them (testing.md §5 and the state
 * checklist in states.md): `default` is the handler's own data, the others produce the designed
 * states. A handler adds its own scenarios (`locked`, `expired`…) next to these.
 */
export const SCENARIOS = [
  'default',
  'slow',
  'empty',
  'error',
  'forbidden',
  'gated',
  'limit',
  'offline',
] as const
export type Scenario = (typeof SCENARIOS)[number]
export const DEFAULT_SCENARIO: Scenario = 'default'

/** `?scenario=error` on a request. */
export const SCENARIO_QUERY_PARAM = 'scenario'
/** `x-mock-scenario: error` on a request (tests, scripts). */
export const SCENARIO_HEADER = 'x-mock-scenario'
/** `scenario=error` cookie, set from the mock server's `/__mock` page; the app forwards it to the API. */
export const SCENARIO_COOKIE = 'scenario'
/** Every mocked response names the scenario that produced it. */
export const SCENARIO_RESPONSE_HEADER = 'x-mock-scenario'

/** The `slow` scenario waits this long before answering: long enough to see every skeleton. */
export const DEFAULT_SLOW_DELAY_MS = 3000

/** Request IDs of mocked error responses, so the error state shows one like the real API's. */
export const MOCK_REQUEST_ID_PREFIX = 'req_mock_'
