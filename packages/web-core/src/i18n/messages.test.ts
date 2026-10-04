// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CLIENT_ERROR_CODES, ERROR_CODE_SOURCES, ERROR_CODES } from '@surefy/contracts'
import { DEFAULT_UI_LABELS } from '@surefy/ui/lib/labels'

import { DEFAULT_LOCALE, ERROR_DOMAINS } from './i18n.constants'
import { loadSharedMessages } from './loadSharedMessages'

const MESSAGES_DIR = join(import.meta.dirname, '../../messages')
const LOCALES = readdirSync(MESSAGES_DIR).filter((name) =>
  statSync(join(MESSAGES_DIR, name)).isDirectory(),
)
const CLIENT_KEYS = [...Object.values(CLIENT_ERROR_CODES), 'fallback']
const ERROR_CODE_KEY = /^([A-Z][A-Z0-9]*(_[A-Z0-9]+)*|fallback)$/
const CAMEL_CASE_KEY = /^[a-z][a-zA-Z0-9]*(\.[a-z]\w*)*$/

type Json = Record<string, unknown>

function sorted(values: readonly string[]): string[] {
  return values.toSorted((a, b) => a.localeCompare(b))
}

function readJson(...path: string[]): Json {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, ...path), 'utf8')) as Json
}

function jsonFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return jsonFiles(path, base)
    return name.endsWith('.json') ? [path.slice(base.length + 1)] : []
  })
}

function flatKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flatKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('shared messages', () => {
  it('ship one errors/<domain>.json per contracts code source', () => {
    const files = readdirSync(join(MESSAGES_DIR, DEFAULT_LOCALE, 'errors')).map((name) =>
      name.replace(/\.json$/, ''),
    )

    expect(sorted(files)).toEqual(sorted(ERROR_DOMAINS))
  })

  it('cover every API error code, the client codes and the fallback', async () => {
    const { errors } = await loadSharedMessages(DEFAULT_LOCALE)

    expect(sorted(Object.keys(errors))).toEqual(
      sorted([...Object.values(ERROR_CODES), ...CLIENT_KEYS]),
    )
    for (const text of Object.values(errors)) expect(text).toMatch(/\S/)
  })

  it.each(ERROR_DOMAINS)('keep errors/%s.json to the codes of that domain', (domain) => {
    const keys = Object.keys(readJson(DEFAULT_LOCALE, 'errors', `${domain}.json`))
    const allowed = Object.values(ERROR_CODE_SOURCES[domain]) as string[]
    const expected = domain === 'common' ? [...allowed, ...CLIENT_KEYS] : allowed

    expect(sorted(keys)).toEqual(sorted(expected))
  })

  it('give common every built-in label of @surefy/ui', () => {
    const common = readJson(DEFAULT_LOCALE, 'common.json')

    for (const key of Object.keys(DEFAULT_UI_LABELS)) expect(common[key]).toMatch(/\S/)
  })

  it('use camelCase keys everywhere except the error codes', () => {
    for (const file of jsonFiles(join(MESSAGES_DIR, DEFAULT_LOCALE))) {
      const pattern = file.startsWith('errors/') ? ERROR_CODE_KEY : CAMEL_CASE_KEY
      for (const key of flatKeys(readJson(DEFAULT_LOCALE, file))) {
        expect(key, `${file}: ${key}`).toMatch(pattern)
      }
    }
  })

  it('have the same files and keys in every locale', () => {
    const sourceFiles = sorted(jsonFiles(join(MESSAGES_DIR, DEFAULT_LOCALE)))

    for (const locale of LOCALES) {
      expect(sorted(jsonFiles(join(MESSAGES_DIR, locale))), locale).toEqual(sourceFiles)
      for (const file of sourceFiles) {
        const expected = sorted(flatKeys(readJson(DEFAULT_LOCALE, file)))
        expect(sorted(flatKeys(readJson(locale, file))), `${locale}/${file}`).toEqual(expected)
      }
    }
  })
})
