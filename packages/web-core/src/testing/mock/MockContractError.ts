// SPDX-License-Identifier: AGPL-3.0-only
export interface MockContractErrorInfo {
  method: string
  path: string
  scenario: string
  status: number
  /** The Zod issues, already formatted for a terminal. */
  issues: string
}

/**
 * A mocked response does not match the contract schema of its route: a bug in the handler or a
 * contract change that the handler missed. The dev server answers 500 and prints it; the test
 * server fails the test.
 */
export class MockContractError extends Error {
  readonly info: MockContractErrorInfo

  constructor(info: MockContractErrorInfo) {
    const route = `${info.method.toUpperCase()} ${info.path}`
    super(
      `Mocked response of ${route} (scenario "${info.scenario}", status ${info.status}) does not match its contract:\n${info.issues}`,
    )
    this.name = 'MockContractError'
    this.info = info
  }
}

export function isMockContractError(error: unknown): error is MockContractError {
  return error instanceof MockContractError
}
