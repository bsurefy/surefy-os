// SPDX-License-Identifier: AGPL-3.0-only
// Usage: node --test .github/scripts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sectionOf } from './release-notes.mjs'

const CHANGELOG = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-01

### Added

- Agents.

## [0.1.0] - 2026-10-07

### Added

- First release.

[0.2.0]: https://example.test/v0.2.0
[0.1.0]: https://example.test/v0.1.0
`

test('returns the body of one release without its heading', () => {
  assert.equal(sectionOf(CHANGELOG, '0.2.0'), '### Added\n\n- Agents.')
})

test('drops the link references that follow the last release', () => {
  assert.equal(sectionOf(CHANGELOG, '0.1.0'), '### Added\n\n- First release.')
})

test('does not match a version that only starts the same', () => {
  assert.throws(() => sectionOf(CHANGELOG, '0.2'), /no section/)
  assert.throws(() => sectionOf(CHANGELOG, '0.20.0'), /no section/)
})

test('fails for a missing release and for an empty section', () => {
  assert.throws(() => sectionOf(CHANGELOG, '9.9.9'), /no section "## \[9\.9\.9\]"/)
  assert.throws(() => sectionOf('## [1.0.0] - 2027-01-01\n\n## [0.9.0]\n- x', '1.0.0'), /is empty/)
})

test('accepts a prerelease version', () => {
  assert.equal(
    sectionOf('## [1.0.0-rc.1] - 2027-01-01\n\n- Candidate.\n', '1.0.0-rc.1'),
    '- Candidate.',
  )
})
