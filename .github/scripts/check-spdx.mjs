// SPDX-License-Identifier: AGPL-3.0-only
// Fails when a tracked source file does not start with the AGPL SPDX header (CONTRIBUTING.md).
// Usage: node .github/scripts/check-spdx.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const HEADER = 'SPDX-License-Identifier: AGPL-3.0-only'
const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|py|sh|css)$/
const SKIP = [/(?:^|\/)generated\//, /\.d\.ts$/, /(?:^|\/)next-env\.d\.ts$/, /^\.husky\//]

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => SOURCE.test(file) && !SKIP.some((pattern) => pattern.test(file)))

const missing = files.filter((file) => {
  const head = readFileSync(file, 'utf8').split('\n', 3).join('\n')
  return !head.includes(HEADER)
})

if (missing.length > 0) {
  process.stderr.write(
    `Missing "${HEADER}" in the first lines of:\n${missing.map((f) => `  ${f}`).join('\n')}\n`,
  )
  process.exit(1)
}
process.stdout.write(`SPDX headers: ${files.length} source files checked\n`)
