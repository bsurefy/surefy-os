// SPDX-License-Identifier: AGPL-3.0-only
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { isMockContractError } from '../mock/MockContractError'

import type { MockContractError } from '../mock/MockContractError'
import type { AnyHandler } from 'msw'
import type { SetupServer } from 'msw/node'

export interface TestServer {
  /** The MSW server: `server.use(…)` overrides a route for one test. */
  server: SetupServer
  /** The contract violations since the last call, oldest first; taking them clears the list. */
  takeViolations: () => MockContractError[]
}

/**
 * An MSW server for tests that remembers every contract violation of a mocked response, so a
 * handler that drifts from its schema can fail the test instead of hiding behind a 500.
 */
export function createTestServer(...handlers: AnyHandler[]): TestServer {
  const server = setupServer(...handlers)
  let violations: MockContractError[] = []

  server.events.on('unhandledException', ({ error }) => {
    if (isMockContractError(error)) violations.push(error)
  })

  return {
    server,
    takeViolations() {
      const taken = violations
      violations = []
      return taken
    },
  }
}

/**
 * The test server with its lifecycle wired to the suite: it listens before the tests (an
 * unhandled request is an error), resets the per-test handlers after each test and fails the
 * test when a mocked response broke its contract, and closes after the suite.
 *
 * @example
 * const server = setupTestServer(...exampleDomain.handlers)
 * it('shows the items', async () => {
 *   server.use(http.get(mockPath('/agents'), () => mockPage([agentFactory()])))
 *   …
 * })
 */
export function setupTestServer(...handlers: AnyHandler[]): SetupServer {
  const { server, takeViolations } = createTestServer(...handlers)

  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' })
  })
  afterEach(() => {
    server.resetHandlers()
    const [first] = takeViolations()
    if (first) throw first
  })
  afterAll(() => {
    server.close()
  })

  return server
}
