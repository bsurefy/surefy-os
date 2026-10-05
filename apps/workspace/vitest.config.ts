// SPDX-License-Identifier: AGPL-3.0-only
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = { '@': new URL('./src', import.meta.url).pathname }

// Two projects: the mock server and the session proxy run under Node, components and controllers
// (`*.test.tsx`) under happy-dom.
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
          // Room for several Testing Library waits (5 s each, see the setup file) in one test.
          testTimeout: 20000,
          // Processed by Vite so that a test's mock of `next/navigation` reaches the nuqs adapter.
          server: { deps: { inline: ['nuqs'] } },
        },
      },
    ],
  },
})
