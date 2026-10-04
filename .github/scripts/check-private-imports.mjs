// SPDX-License-Identifier: AGPL-3.0-only
// The public repository never imports or references private packages (docs: open-core rules).
// Usage: node .github/scripts/check-private-imports.mjs
import { execFileSync } from 'node:child_process'

const PRIVATE = String.raw`@surefy/(ee-api|cloud-api|license-issuer)|surefy-os-enterprise`

let output = ''
try {
  output = execFileSync(
    'git',
    ['grep', '-nE', PRIVATE, '--', '.', ':!*.md', ':!.github/scripts/check-private-imports.mjs'],
    { encoding: 'utf8' },
  )
} catch (error) {
  // git grep exits with 1 when nothing matches.
  if (error.status !== 1) throw error
}

if (output.trim()) {
  process.stderr.write(`Private package references in public code:\n${output}`)
  process.exit(1)
}
process.stdout.write('No private package references\n')
