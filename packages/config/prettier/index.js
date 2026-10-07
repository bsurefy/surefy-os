// SPDX-License-Identifier: AGPL-3.0-only
/** Prettier config shared by every workspace (docs/guidelines: no semicolons, single quotes). */
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cn', 'cva'],
}
