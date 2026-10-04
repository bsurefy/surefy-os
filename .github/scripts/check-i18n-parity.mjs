// SPDX-License-Identifier: AGPL-3.0-only
// Every locale has exactly the keys of the English (source) locale, in every messages folder.
// Folders: apps/*/messages/<locale>/ and packages/web-core/messages/<locale>/ (JSON files, nested).
// Usage: node .github/scripts/check-i18n-parity.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SOURCE_LOCALE = 'en'
const roots = [
  ...readdirSync('apps').map((app) => join('apps', app, 'messages')),
  join('packages', 'web-core', 'messages'),
].filter((dir) => existsSync(dir))

/** All JSON files under a locale folder, as paths relative to it. */
function jsonFiles(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return jsonFiles(path, base)
    return name.endsWith('.json') ? [relative(base, path)] : []
  })
}

/** Flattened keys of a JSON object: { a: { b: 'x' } } -> ['a.b']. */
function keys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  )
}

const problems = []
let checked = 0
for (const root of roots) {
  const sourceDir = join(root, SOURCE_LOCALE)
  if (!existsSync(sourceDir)) continue
  const locales = readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory())
  for (const file of jsonFiles(sourceDir)) {
    const expected = new Set(keys(JSON.parse(readFileSync(join(sourceDir, file), 'utf8'))))
    for (const locale of locales.filter((name) => name !== SOURCE_LOCALE)) {
      const path = join(root, locale, file)
      if (!existsSync(path)) {
        problems.push(`${path}: missing file`)
        continue
      }
      const actual = new Set(keys(JSON.parse(readFileSync(path, 'utf8'))))
      const missing = [...expected].filter((key) => !actual.has(key))
      const extra = [...actual].filter((key) => !expected.has(key))
      if (missing.length > 0) problems.push(`${path}: missing ${missing.join(', ')}`)
      if (extra.length > 0) problems.push(`${path}: extra ${extra.join(', ')}`)
      checked++
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `Translation keys differ from "${SOURCE_LOCALE}":\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
  )
  process.exit(1)
}
process.stdout.write(`Translation keys: ${checked} locale files match "${SOURCE_LOCALE}"\n`)
