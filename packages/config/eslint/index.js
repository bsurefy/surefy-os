// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared ESLint flat configs for SurefyOS workspaces.
 *
 * Each workspace has an `eslint.config.js` that calls one factory with its own directory:
 *
 *   import { nodeConfig } from '@surefy/config/eslint'
 *   export default nodeConfig({ tsconfigRootDir: import.meta.dirname })
 *
 * Factories: baseConfig (any TypeScript), nodeConfig (apps/api), libraryConfig (packages),
 * nextConfig (Next.js apps). Layer and module rules are added per workspace with `boundariesConfig`.
 */
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import boundaries from 'eslint-plugin-boundaries'
import { importX } from 'eslint-plugin-import-x'
import reactHooks from 'eslint-plugin-react-hooks'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const IGNORES = globalIgnores([
  '**/dist/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/node_modules/**',
  '**/*.generated.*',
  '**/generated/**',
  '**/next-env.d.ts',
])

/** Selected unicorn rules (the full preset is too opinionated for this codebase). */
const UNICORN_RULES = {
  'unicorn/prefer-node-protocol': 'error',
  'unicorn/no-for-each': 'error',
  'unicorn/prefer-array-flat-map': 'error',
  'unicorn/prefer-string-replace-all': 'error',
  'unicorn/prefer-at': 'error',
  'unicorn/no-useless-undefined': 'error',
  'unicorn/throw-new-error': 'error',
  'unicorn/prefer-type-error': 'error',
  'unicorn/no-instanceof-builtins': 'error',
}

/** Naming rules from the coding guidelines (camelCase, PascalCase types, UPPER_CASE constants). */
const NAMING_RULES = {
  '@typescript-eslint/naming-convention': [
    'error',
    { selector: 'default', format: ['strictCamelCase'], leadingUnderscore: 'allow' },
    { selector: 'import', format: null },
    { selector: 'variable', format: ['strictCamelCase', 'UPPER_CASE', 'StrictPascalCase'] },
    { selector: 'function', format: ['strictCamelCase', 'StrictPascalCase'] },
    { selector: 'parameter', format: ['strictCamelCase'], leadingUnderscore: 'allow' },
    { selector: 'typeLike', format: ['StrictPascalCase'] },
    { selector: 'enumMember', format: ['UPPER_CASE'] },
    // Object keys follow the data they describe (HTTP headers, SQL columns, error codes).
    { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
  ],
}

/**
 * Any TypeScript workspace: type-aware typescript-eslint, import order and cycles, sonarjs,
 * selected unicorn rules, naming, no console.
 * @param {{ tsconfigRootDir: string }} options
 */
export function baseConfig({ tsconfigRootDir }) {
  return defineConfig(
    IGNORES,
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    importX.flatConfigs.recommended,
    importX.flatConfigs.typescript,
    sonarjs.configs.recommended,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      plugins: { unicorn },
      settings: {
        'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
      },
      rules: {
        ...UNICORN_RULES,
        ...NAMING_RULES,
        'no-console': 'error',
        'import-x/no-cycle': 'error',
        'import-x/no-default-export': 'off',
        // TypeScript already checks named and default imports; this rule misfires on plugin packages.
        'import-x/no-named-as-default-member': 'off',
        'import-x/order': [
          'error',
          {
            groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
            pathGroups: [{ pattern: '@surefy/**', group: 'internal' }],
            pathGroupsExcludedImportTypes: ['builtin'],
            'newlines-between': 'always',
            alphabetize: { order: 'asc', caseInsensitive: true },
          },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'separate-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      },
    },
    {
      // Plain JavaScript config files are not part of a tsconfig project.
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
  )
}

/** apps/api (server and worker). */
export function nodeConfig(options) {
  return defineConfig(baseConfig(options), {
    languageOptions: { globals: globals.node },
  })
}

/** Shared packages (contracts, ui, web-core, ml-client). */
export function libraryConfig(options) {
  return defineConfig(baseConfig(options), {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  })
}

/**
 * Next.js apps: Next.js core web vitals, React hooks 7 with the React Compiler rules as errors.
 * @param {{ tsconfigRootDir: string }} options
 */
export function nextConfig(options) {
  const compilerRules = Object.fromEntries(
    Object.keys(reactHooks.configs.flat.recommended.rules ?? {}).map((rule) => [rule, 'error']),
  )
  return defineConfig(nextVitals, baseConfig(options), {
    languageOptions: { globals: globals.browser },
    rules: compilerRules,
  })
}

/**
 * Layer and module rules for one workspace (eslint-plugin-boundaries).
 * @param {{ elements: object[], rules: object[] }} options
 */
export function boundariesConfig({ elements, rules }) {
  return defineConfig({
    plugins: { boundaries },
    settings: { 'boundaries/elements': elements },
    rules: {
      'boundaries/element-types': ['error', { default: 'disallow', rules }],
      'boundaries/no-unknown-files': 'off',
    },
  })
}
