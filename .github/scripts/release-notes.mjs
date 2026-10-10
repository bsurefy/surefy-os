// SPDX-License-Identifier: AGPL-3.0-only
// Prints the CHANGELOG.md section of one release, for the notes of its GitHub release.
// Usage: node .github/scripts/release-notes.mjs 0.2.0     (a leading "v" is accepted)
// Fails when the release has no section or the section is empty.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The body of `## [version] - date`, up to the next release heading, without link references. */
export function sectionOf(changelog, version) {
  const lines = changelog.split('\n')
  const heading = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\](?: - .*)?$`)
  const start = lines.findIndex((line) => heading.test(line))
  if (start === -1) throw new Error(`CHANGELOG.md has no section "## [${version}]"`)
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## ['))
  const body = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((line) => !/^\[[^\]]+\]: \S+$/.test(line))
    .join('\n')
    .trim()
  if (body === '') throw new Error(`The CHANGELOG.md section for ${version} is empty`)
  return body
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = (process.argv[2] ?? '').replace(/^v/, '')
  if (version === '') {
    process.stderr.write('Usage: node .github/scripts/release-notes.mjs <version>\n')
    process.exit(2)
  }
  try {
    process.stdout.write(`${sectionOf(readFileSync('CHANGELOG.md', 'utf8'), version)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
}
