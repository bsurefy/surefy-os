// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="node" />
// Recomputes the contrast table of docs/design/shared/foundations.md (section 2.4) from the CSS
// tokens, so a color change that breaks readability fails the build.
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const colorsCss = read('./tokens/colors.css')
const semanticCss = read('./tokens/semantic.css')

type Tokens = Map<string, string>

/** Declarations of every rule block whose selector matches exactly. */
function declarations(css: string, selector: string): Tokens {
  const tokens: Tokens = new Map()
  const blocks = css.replaceAll(/\/\*[\s\S]*?\*\//g, '').split('}')
  for (const block of blocks) {
    const [head, body] = block.split('{')
    if (head?.trim() !== selector || body === undefined) continue
    for (const line of body.split(';')) {
      const colon = line.indexOf(':')
      const name = line.slice(0, colon).trim()
      if (colon > 0 && name.startsWith('--')) tokens.set(name, line.slice(colon + 1).trim())
    }
  }
  return tokens
}

const palette = declarations(colorsCss, ':root')
const root = declarations(semanticCss, ':root')
const dark = declarations(semanticCss, '.dark')
const consoleSidebar = declarations(semanticCss, "[data-sidebar-theme='console']")

const themes = {
  light: new Map([...palette, ...root]),
  dark: new Map([...palette, ...root, ...dark]),
}

function resolve(tokens: Tokens, name: string): string {
  const value = tokens.get(name)
  if (value === undefined) throw new Error(`token ${name} is not defined`)
  const reference = /^var\((--[\w-]+)\)$/.exec(value)
  return reference?.[1] ? resolve(tokens, reference[1]) : value
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

const STATUS = ['success', 'warning', 'destructive', 'info'] as const
const SOFT_FILLS = ['--primary-soft', ...STATUS.map((s) => `--${s}-soft`)]

/** [foreground token, background token, minimum ratio] per row of the table. */
const PAIRS: [string, string, number][] = [
  ['--foreground', '--surface', 4.5],
  ['--foreground-secondary', '--surface', 4.5],
  ['--foreground-secondary', '--surface-2', 4.5],
  ['--muted-foreground', '--surface', 4.5],
  ['--muted-foreground', '--surface-2', 4.5],
  ['--muted-foreground', '--background', 4.5],
  ...SOFT_FILLS.map((fill): [string, string, number] => ['--muted-foreground', fill, 4.5]),
  ['--primary-foreground', '--primary', 4.5],
  ['--primary-foreground', '--primary-hover', 4.5],
  ['--primary', '--surface', 4.5],
  ['--primary', '--surface-2', 4.5],
  ['--primary-soft-foreground', '--primary-soft', 4.5],
  ...STATUS.map((s): [string, string, number] => [`--${s}-soft-foreground`, `--${s}-soft`, 4.5]),
  ...STATUS.flatMap((s): [string, string, number][] => [
    [`--${s}`, '--surface', 4.5],
    [`--${s}`, '--background', 4.5],
  ]),
  ['--destructive-foreground', '--destructive', 4.5],
  ['--input', '--surface', 3],
  ['--input', '--surface-2', 3],
  ...SOFT_FILLS.map((fill): [string, string, number] => ['--input', fill, 3]),
  ['--ring', '--surface', 3],
  ['--ring', '--surface-2', 3],
]

describe.each(Object.entries(themes))('%s theme', (_theme, tokens) => {
  it.each(PAIRS)('%s on %s reaches %s:1', (foreground, background, minimum) => {
    expect(
      contrast(resolve(tokens, foreground), resolve(tokens, background)),
    ).toBeGreaterThanOrEqual(minimum)
  })

  it.each(['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'])(
    '%s reaches 4.4:1 on every surface',
    (chart) => {
      for (const background of ['--surface', '--surface-2', '--background']) {
        expect(
          contrast(resolve(tokens, chart), resolve(tokens, background)),
        ).toBeGreaterThanOrEqual(4.4)
      }
    },
  )
})

describe('console sidebar (dark in both themes)', () => {
  const tokens = new Map([...palette, ...consoleSidebar])
  it.each([
    ['--sidebar-foreground', 4.5],
    ['--sidebar-muted', 4.5],
    ['--sidebar-ring', 3],
  ] as const)('%s on the console sidebar reaches %s:1', (token, minimum) => {
    expect(contrast(resolve(tokens, token), resolve(tokens, '--sidebar'))).toBeGreaterThanOrEqual(
      minimum,
    )
  })
})

describe('token sets', () => {
  it('give every light token a dark value', () => {
    const themed = [...root.keys()].filter(
      (name) => !/^var\(--(?!palette)/.test(root.get(name) ?? ''),
    )
    expect(themed.filter((name) => !dark.has(name))).toEqual([])
  })
})
