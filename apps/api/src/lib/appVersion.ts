// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs'

/**
 * The product version: the API package's own `version`. Found by walking up from this file to the
 * first `package.json`, so it works from the sources, a type-stripped run and the production bundle.
 */
const readAppVersion = (): string => {
  for (let dir = new URL('./', import.meta.url); ; dir = new URL('../', dir)) {
    try {
      const { version } = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8')) as {
        version?: unknown
      }
      return typeof version === 'string' ? version : '0.0.0'
    } catch {
      if (dir.pathname === '/') return '0.0.0'
    }
  }
}

export const APP_VERSION = readAppVersion()
