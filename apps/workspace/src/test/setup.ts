// SPDX-License-Identifier: AGPL-3.0-only
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Shared CI runners are several times slower than a laptop; one second is too short for a query
// that waits on the mock server and a re-render.
configure({ asyncUtilTimeout: 5000 })

// Vitest globals are off, so Testing Library cannot register its automatic cleanup.
afterEach(() => {
  cleanup()
})
