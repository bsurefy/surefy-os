// SPDX-License-Identifier: AGPL-3.0-only
import { createMl } from '@/integrations/ml/index.js'

import type { Config } from '@/core/config/index.js'
import type { MlService } from '@/integrations/ml/index.js'

/**
 * The ML service of a test app that does not script one: the personal-data filter finds nothing,
 * so a message to a cloud model goes through as it is; parsing still talks to `ML_SERVICE_URL`,
 * which no test serves.
 */
export function createDefaultFakeMl(config: Config): MlService {
  const real = createMl(config)
  return {
    parseDocument: (input, signal) => real.parseDocument(input, signal),
    detectPii: (input) =>
      Promise.resolve({ language: 'en', results: input.texts.map(() => ({ findings: [] })) }),
    maskPii: (input) =>
      Promise.resolve({
        language: 'en',
        results: input.texts.map((text) => ({ text, findings: [] })),
      }),
  }
}
