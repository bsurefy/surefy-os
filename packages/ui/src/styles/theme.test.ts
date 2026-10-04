// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="node" />
// Compiles the styles entry with Tailwind and checks that the token utilities exist.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compile } from 'tailwindcss'
import { beforeAll, describe, expect, it } from 'vitest'

const stylesDir = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

async function loadStylesheet(id: string, base: string) {
  const path = id === 'tailwindcss' ? require.resolve('tailwindcss/index.css') : resolve(base, id)
  return { path, base: dirname(path), content: await readFile(path, 'utf8') }
}

let build: (candidates: string[]) => string

beforeAll(async () => {
  const css = await readFile(resolve(stylesDir, 'globals.css'), 'utf8')
  const compiler = await compile(css, { base: stylesDir, loadStylesheet })
  build = (candidates) => compiler.build(candidates)
})

// `@theme inline` writes the token variables into utilities, so dark mode and brand overrides
// apply at runtime.
describe('theme utilities', () => {
  it.each([
    ['bg-surface', 'background-color: var(--surface)'],
    ['text-muted-foreground', 'color: var(--muted-foreground)'],
    ['bg-warning-soft', 'background-color: var(--warning-soft)'],
    ['bg-confidence-high', 'background-color: var(--confidence-high)'],
    ['bg-sidebar-active', 'background-color: var(--sidebar-active)'],
    ['fill-chart-3', 'fill: var(--chart-3)'],
    ['bg-card', 'background-color: var(--card)'],
    ['font-mono', 'font-family: var(--font-plex-mono), ui-monospace, monospace'],
    ['z-popover', 'z-index: 50'],
    ['z-banner', 'z-index: 70'],
    ['duration-base', 'transition-duration: 180ms'],
    ['ease-out', '--tw-ease: var(--ease-out)'],
    ['animate-status-pulse', 'animation: var(--animate-status-pulse)'],
    ['text-overline', 'text-transform: uppercase'],
    ['text-code', 'font-family: var(--font-mono)'],
  ])('%s', (candidate, declaration) => {
    expect(build([candidate])).toContain(declaration)
  })

  it('gives each text style its size, line height, weight and tracking', () => {
    const css = build(['text-page-title'])
    expect(css).toContain('font-size: var(--text-page-title)')
    expect(css).toContain('line-height: var(--tw-leading, var(--text-page-title--line-height))')
    expect(css).toContain('font-weight: var(--tw-font-weight, var(--text-page-title--font-weight))')
    expect(css).toContain(
      'letter-spacing: var(--tw-tracking, var(--text-page-title--letter-spacing))',
    )
  })

  it('applies dark-mode variants through the .dark class', () => {
    expect(build(['dark:bg-surface'])).toMatch(/:where\(\.dark, \.dark \*\)/)
  })

  it('keeps the default radius and shadow scale', () => {
    expect(build(['rounded-xl'])).toContain('border-radius: var(--radius-xl)')
    expect(build(['shadow-md'])).toContain('--tw-shadow')
  })
})
