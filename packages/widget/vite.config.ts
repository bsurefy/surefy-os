// SPDX-License-Identifier: MIT
import { defineConfig } from 'vite'

// One self-contained script (`dist/widget.js`) that the API serves at WIDGET_SCRIPT_PATH. The
// entry exports nothing, so the IIFE adds no global besides `window.SurefyWidget`. Only types come
// from `@surefy/contracts`; they are erased, so no AGPL code ends up in the bundle (ADR 0022).
export default defineConfig({
  build: {
    target: 'es2020',
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/index.ts',
      output: {
        format: 'iife',
        entryFileNames: 'widget.js',
      },
    },
  },
})
