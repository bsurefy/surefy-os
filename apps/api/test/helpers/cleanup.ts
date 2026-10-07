// SPDX-License-Identifier: AGPL-3.0-only
type Teardown = () => Promise<void> | void

const teardowns: Teardown[] = []

/**
 * Registers something to close when the current test file ends (apps, containers, clients).
 * `createTestApp` uses it, so a test can build an app inline without an `afterAll` of its own.
 */
export function onFileTeardown(teardown: Teardown): void {
  teardowns.push(teardown)
}

/** Runs the registered teardowns, last registered first; every one runs even if another fails. */
export async function runFileTeardowns(): Promise<void> {
  const pending = teardowns.splice(0).reverse()
  const results = await Promise.allSettled(
    pending.map(async (teardown) => {
      await teardown()
    }),
  )
  const failures = results.filter((result) => result.status === 'rejected')
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason as unknown),
      `${failures.length} test teardown(s) failed`,
    )
  }
}
