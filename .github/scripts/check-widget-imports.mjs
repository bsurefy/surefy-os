// SPDX-License-Identifier: AGPL-3.0-only
// The widget is MIT and bundled into third-party pages, so it may take only types from the AGPL
// packages (ADR 0022): every `@surefy/*` import in its shipped source is `import type`, and its
// package.json has no `@surefy/*` runtime dependency. Tests may import anything.
// Usage: node .github/scripts/check-widget-imports.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ROOT = 'packages/widget/'
const SHIPPED = /^packages\/widget\/src\/(?!test\/).*(?<!\.test)\.ts$/
const IMPORT = /^\s*(import|export)\s+(type\s+)?[^'"]*?\bfrom\s+['"](@surefy\/[^'"]+)['"]/gm
const SIDE_EFFECT = /^\s*import\s+['"](@surefy\/[^'"]+)['"]/gm

const problems = []
const files = execFileSync('git', ['ls-files', '-z', '--', ROOT], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => SHIPPED.test(file))

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(IMPORT)) {
    if (!match[2]) problems.push(`${file}: "${match[3]}" must be imported with \`import type\``)
  }
  for (const match of source.matchAll(SIDE_EFFECT)) {
    problems.push(`${file}: "${match[1]}" must not be imported for its side effects`)
  }
}

const manifest = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'))
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  for (const name of Object.keys(manifest[field] ?? {})) {
    if (name.startsWith('@surefy/')) problems.push(`${ROOT}package.json: ${name} in ${field}`)
  }
}
if (manifest.license !== 'MIT') problems.push(`${ROOT}package.json: license must be MIT`)

if (problems.length > 0) {
  process.stderr.write(
    `The widget may only take types from SurefyOS packages:\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
  )
  process.exit(1)
}
process.stdout.write(`Widget imports: ${files.length} shipped files checked\n`)
