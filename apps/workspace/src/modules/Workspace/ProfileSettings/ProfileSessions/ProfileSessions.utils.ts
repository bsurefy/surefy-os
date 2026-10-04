// SPDX-License-Identifier: AGPL-3.0-only
// Product names, not translated text: they read the same in every language.
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
]

function firstMatch(userAgent: string, table: [RegExp, string][]): string | undefined {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1]
}

/** Browser and system of a session from its user agent; null when neither is recognized. */
export function describeUserAgent(
  userAgent: string | null,
): { browser: string; os: string } | null {
  if (!userAgent) return null
  const browser = firstMatch(userAgent, BROWSERS)
  const os = firstMatch(userAgent, SYSTEMS)
  return browser && os ? { browser, os } : null
}
