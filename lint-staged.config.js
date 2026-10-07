// SPDX-License-Identifier: AGPL-3.0-only
// Staged files only: format everything Prettier understands; ESLint runs per package in CI and pre-push.
export default {
  '*.{js,mjs,cjs,ts,tsx,json,md,mdx,css,yml,yaml}': 'prettier --write',
}
