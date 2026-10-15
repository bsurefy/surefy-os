// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { parsePathRules } from './AddLinkDialog/AddLinkDialog.controller'
import {
  canRetryWithOcr,
  getFileContentType,
  getSourceKindCode,
  groupExpiredByConnection,
  isSignInExpired,
  summarizeFolders,
  toSourceSort,
  toStatusParam,
} from './SourcesTab.utils'
import { sourceFactory } from '../../../../mock/handlers/knowledge'

describe('getFileContentType', () => {
  it('uses the browser type when it is accepted', () => {
    expect(getFileContentType({ name: 'a.pdf', type: 'application/pdf' })).toBe('application/pdf')
  })

  it('falls back to the extension for the types browsers leave empty', () => {
    expect(getFileContentType({ name: 'Notes.MD', type: '' })).toBe('text/markdown')
    expect(getFileContentType({ name: 'data.csv', type: 'application/vnd.ms-excel' })).toBe(
      'text/csv',
    )
    expect(getFileContentType({ name: 'scan.TIFF', type: '' })).toBe('image/tiff')
  })

  it('refuses everything else', () => {
    expect(getFileContentType({ name: 'archive.zip', type: 'application/zip' })).toBeNull()
    expect(getFileContentType({ name: 'noextension', type: '' })).toBeNull()
    expect(getFileContentType({ name: 'constructor', type: '' })).toBeNull()
  })
})

describe('filters and sorts', () => {
  it('asks the API for a status only when one is chosen', () => {
    expect(toStatusParam('all')).toBeUndefined()
    expect(toStatusParam('failed')).toBe('failed')
  })

  it('maps a column and direction to a known sort, newest first otherwise', () => {
    expect(toSourceSort('name', false)).toBe('name')
    expect(toSourceSort('sizeBytes', true)).toBe('-sizeBytes')
    expect(toSourceSort('status', true)).toBe('-createdAt')
  })
})

describe('canRetryWithOcr', () => {
  it('is for scans and images that failed', () => {
    expect(canRetryWithOcr({ type: 'file', status: 'failed', contentType: 'image/tiff' })).toBe(
      true,
    )
    expect(
      canRetryWithOcr({ type: 'file', status: 'partially_failed', contentType: 'application/pdf' }),
    ).toBe(true)
    expect(canRetryWithOcr({ type: 'file', status: 'ready', contentType: 'application/pdf' })).toBe(
      false,
    )
    expect(canRetryWithOcr({ type: 'file', status: 'failed', contentType: 'text/csv' })).toBe(false)
    expect(canRetryWithOcr({ type: 'link', status: 'failed', contentType: null })).toBe(false)
  })
})

describe('parsePathRules', () => {
  it('keeps one trimmed rule per line and drops blanks', () => {
    expect(parsePathRules(' /docs \n\n/blog\n  ')).toEqual(['/docs', '/blog'])
    expect(parsePathRules('')).toEqual([])
  })
})

const DRIVE_CONNECTION = '00000000-0070-4000-8000-000000000001'
const NOTION_CONNECTION = '00000000-0070-4000-8000-000000000003'

const connector = (provider: 'google_drive' | 'notion', overrides = {}) =>
  sourceFactory({
    type: 'connector',
    connector: { provider, folders: [{ externalId: 'f1', name: 'Public' }], syncEvery: 'daily' },
    connectionId: provider === 'notion' ? NOTION_CONNECTION : DRIVE_CONNECTION,
    ...overrides,
  })

const expired = { status: 'paused', errorCode: 'KNOWLEDGE_CONNECTION_EXPIRED' } as const

describe('connector sources', () => {
  it('tiles a connector with its app', () => {
    expect(getSourceKindCode(connector('google_drive'))).toBe('GD')
    expect(getSourceKindCode(connector('notion'))).toBe('N')
  })

  it('tells an expired sign-in from other pauses and failures', () => {
    expect(isSignInExpired(connector('notion', expired))).toBe(true)
    expect(isSignInExpired(connector('notion', { status: 'paused', errorCode: null }))).toBe(false)
    expect(
      isSignInExpired(connector('notion', { status: 'failed', errorCode: expired.errorCode })),
    ).toBe(false)
  })

  it('groups paused sources by the connection whose sign-in expired', () => {
    const groups = groupExpiredByConnection([
      connector('notion', expired),
      connector('google_drive'),
      connector('notion', expired),
      connector('google_drive', expired),
    ])
    expect(groups.map(({ connectionId, sources }) => [connectionId, sources.length])).toEqual([
      [NOTION_CONNECTION, 2],
      [DRIVE_CONNECTION, 1],
    ])
  })

  it('names the first folder and counts the rest', () => {
    expect(summarizeFolders([{ externalId: 'a', name: 'Public' }])).toEqual({
      first: 'Public',
      more: 0,
    })
    expect(
      summarizeFolders([
        { externalId: 'a', name: 'Public' },
        { externalId: 'b', name: 'Internal' },
        { externalId: 'c', name: 'Finance' },
      ]),
    ).toEqual({ first: 'Public', more: 2 })
  })
})
