// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { CHAT_PARTS_MAX_BYTES, CHAT_RESTORE_WINDOW_DAYS } from '@surefy/contracts'

import {
  attachmentKindOf,
  cleanTitle,
  contentTextOf,
  deriveUploadKey,
  emptyParts,
  fallbackTitle,
  fitParts,
  isRestorable,
  maxBytesOf,
  purgeAtOf,
  signUpload,
  sniffContentType,
  sourcesBlock,
  verifyUpload,
} from '../chats.utils.js'

const DAY_MS = 86_400_000

describe('contentTextOf', () => {
  it('joins the text parts and ignores everything else', () => {
    expect(
      contentTextOf([
        { type: 'reasoning', text: 'thinking' },
        { type: 'text', text: 'Hello ' },
        { type: 'source', index: 1, kind: 'web', title: 't', snippet: 's' },
        { type: 'text', text: 'world ' },
      ]),
    ).toBe('Hello world')
  })
})

describe('attachment kinds and limits', () => {
  it('maps content types to a kind and a size limit', () => {
    expect(attachmentKindOf('image/webp')).toBe('image')
    expect(attachmentKindOf('application/pdf')).toBe('document')
    expect(attachmentKindOf('text/csv')).toBe('document')
    expect(attachmentKindOf('application/zip')).toBeNull()
    expect(maxBytesOf('image')).toBe(10 * 1024 * 1024)
    expect(maxBytesOf('document')).toBe(25 * 1024 * 1024)
  })
})

describe('soft delete window', () => {
  it('purges 30 days after the delete and refuses a restore after that', () => {
    const deletedAt = new Date('2026-09-01T00:00:00Z')
    expect(purgeAtOf(deletedAt).getTime() - deletedAt.getTime()).toBe(
      CHAT_RESTORE_WINDOW_DAYS * DAY_MS,
    )
    expect(isRestorable(deletedAt, deletedAt.getTime() + 29 * DAY_MS)).toBe(true)
    expect(isRestorable(deletedAt, deletedAt.getTime() + 30 * DAY_MS)).toBe(false)
  })
})

describe('titles', () => {
  it('cleans a model title: first line, no quotes or marks, a trailing dot dropped', () => {
    expect(cleanTitle('"Refund rules for annual plans."\nSome explanation')).toBe(
      'Refund rules for annual plans',
    )
    expect(cleanTitle('\n\n**Quarterly report**')).toBe('Quarterly report')
    expect(cleanTitle('   ')).toBe('')
  })

  it('cuts a long title at 80 characters with an ellipsis', () => {
    const title = fallbackTitle(`${'word '.repeat(40)}end`)
    expect(title.length).toBeLessThanOrEqual(80)
    expect(title.endsWith('…')).toBe(true)
    expect(fallbackTitle('  two   spaces\nand a line ')).toBe('two spaces and a line')
  })
})

describe('fitParts', () => {
  it('leaves small parts alone and drops tool outputs and long snippets from large ones', () => {
    const small = emptyParts([{ type: 'text', text: 'hi' }])
    expect(fitParts(small)).toBe(small)
    const large = emptyParts([
      { type: 'text', text: 'answer' },
      {
        type: 'tool',
        toolCallId: 'call-1',
        toolName: 'search',
        state: 'done',
        input: {},
        output: 'x'.repeat(CHAT_PARTS_MAX_BYTES),
      },
      { type: 'source', index: 1, kind: 'web', title: 't', snippet: 's'.repeat(1000) },
    ])
    const fitted = fitParts(large)
    expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThan(CHAT_PARTS_MAX_BYTES)
    expect(fitted.parts[0]).toEqual({ type: 'text', text: 'answer' })
    expect(JSON.stringify(fitted)).not.toContain('xxxx')
  })
})

describe('signed upload URLs', () => {
  const key = deriveUploadKey(Buffer.alloc(32, 7).toString('base64'))
  const upload = { orgId: 'o', attachmentId: 'a', sizeBytes: 10, expires: 2_000_000_000 }

  it('verifies only the announced upload before it expires', () => {
    const signature = signUpload(key, upload)
    expect(verifyUpload(key, upload, signature, 1_000_000_000_000)).toBe(true)
    expect(verifyUpload(key, { ...upload, sizeBytes: 11 }, signature)).toBe(false)
    expect(verifyUpload(key, { ...upload, attachmentId: 'b' }, signature)).toBe(false)
    expect(verifyUpload(key, upload, signature, upload.expires * 1000 + 1)).toBe(false)
    expect(verifyUpload(key, upload, 'zz')).toBe(false)
    expect(
      verifyUpload(deriveUploadKey(Buffer.alloc(32, 8).toString('base64')), upload, signature),
    ).toBe(false)
  })
})

describe('sniffContentType', () => {
  const pad = Buffer.alloc(16)
  it('reads the real type of images, PDFs and Word files from the bytes', () => {
    expect(
      sniffContentType(
        Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad]),
        'image/png',
      ),
    ).toBe('image/png')
    expect(
      sniffContentType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), pad]), 'image/png'),
    ).toBe('image/jpeg')
    expect(sniffContentType(Buffer.from('GIF89a......'), 'image/gif')).toBe('image/gif')
    expect(sniffContentType(Buffer.from('RIFF....WEBPVP8 '), 'image/webp')).toBe('image/webp')
    expect(sniffContentType(Buffer.from('%PDF-1.7 ...'), 'application/pdf')).toBe('application/pdf')
    expect(
      sniffContentType(
        Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('word/document.xml')]),
        'application/octet-stream',
      ),
    ).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  })

  it('refuses mismatches: a zip that is not a document, binary text, unknown bytes', () => {
    expect(
      sniffContentType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 'application/zip'),
    ).toBeNull()
    expect(sniffContentType(Buffer.from([0x68, 0x69, 0x00, 0x01]), 'text/plain')).toBeNull()
    expect(sniffContentType(Buffer.from([0xc3, 0x28]), 'text/plain')).toBeNull()
    expect(sniffContentType(Buffer.from('MZ....'), 'image/png')).toBeNull()
    expect(sniffContentType(Buffer.from('# Title\n\nUnicode: ünï'), 'text/markdown')).toBe(
      'text/markdown',
    )
  })
})

describe('sourcesBlock', () => {
  it('numbers the sources for the prompt', () => {
    expect(
      sourcesBlock([
        { index: 1, title: 'Handbook', snippet: 'A' },
        { index: 2, title: 'FAQ', snippet: 'B' },
      ]),
    ).toBe('[1] Handbook\nA\n\n[2] FAQ\nB')
  })
})
