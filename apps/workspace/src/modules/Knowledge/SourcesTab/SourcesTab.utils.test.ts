// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { parsePathRules } from './AddLinkDialog/AddLinkDialog.controller'
import {
  canRetryWithOcr,
  getFileContentType,
  toSourceSort,
  toStatusParam,
} from './SourcesTab.utils'

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
