// SPDX-License-Identifier: AGPL-3.0-only
import { inflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { csvCell, toCsv, zipArchive } from '../dataControl.utils.js'

describe('zipArchive', () => {
  it('writes local headers, a central directory and the end record', () => {
    const data = Buffer.from(JSON.stringify({ hello: 'world' }))
    const zip = zipArchive([{ name: 'organization.json', data }])
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    const nameLength = zip.readUInt16LE(26)
    const compressedSize = zip.readUInt32LE(18)
    expect(zip.subarray(30, 30 + nameLength).toString()).toBe('organization.json')
    const body = zip.subarray(30 + nameLength, 30 + nameLength + compressedSize)
    expect(inflateRawSync(body).equals(data)).toBe(true)
    const end = zip.subarray(zip.length - 22)
    expect(end.readUInt32LE(0)).toBe(0x06054b50)
    expect(end.readUInt16LE(10)).toBe(1)
  })
})

describe('csv', () => {
  it('quotes separators and neutralizes formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell(null)).toBe('')
    expect(toCsv(['name', 'role'], [['Ann', 'owner']])).toBe('name,role\r\nAnn,owner\r\n')
  })
})
