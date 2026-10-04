// SPDX-License-Identifier: AGPL-3.0-only
import { DEFAULT_SCENARIO, DEFAULT_SLOW_DELAY_MS } from './mock.constants'

export interface MockSettings {
  /** The scenario when a request names none (the dev server sets it from `MOCK_SCENARIO`). */
  defaultScenario: string
  /** How long the `slow` scenario waits; tests shorten it. */
  slowDelayMs: number
}

const settings: MockSettings = {
  defaultScenario: DEFAULT_SCENARIO,
  slowDelayMs: DEFAULT_SLOW_DELAY_MS,
}

/** Process-wide settings of the mock handlers; the dev server and tests call it at startup. */
export function configureMockScenarios(next: Partial<MockSettings>): void {
  Object.assign(settings, next)
}

export function getMockSettings(): Readonly<MockSettings> {
  return settings
}

/** Back to the defaults, for tests that changed them. */
export function resetMockSettings(): void {
  settings.defaultScenario = DEFAULT_SCENARIO
  settings.slowDelayMs = DEFAULT_SLOW_DELAY_MS
}
