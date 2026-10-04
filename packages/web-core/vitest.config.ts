// SPDX-License-Identifier: AGPL-3.0-only
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // `server-only` throws outside React Server Components; tests exercise the server entries directly.
      'server-only': new URL('./node_modules/server-only/empty.js', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
