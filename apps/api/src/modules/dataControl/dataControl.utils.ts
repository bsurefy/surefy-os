// SPDX-License-Identifier: AGPL-3.0-only
import { crc32, deflateRawSync } from 'node:zlib'

// Archive and file formats of the exports. Pure functions, unit-tested on their own.

export interface ArchiveFile {
  /** Path inside the archive, `/`-separated, without a leading slash. */
  name: string
  data: Buffer
}

const DOS_EPOCH_DATE = (1 << 5) | 1 // 1980-01-01: archive timestamps carry no information

/**
 * A ZIP archive (deflate, no encryption, no ZIP64): the full organization export, one JSON file
 * per area. Each file stays well below 4 GiB, the format's limit without ZIP64.
 */
export function zipArchive(files: readonly ArchiveFile[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const compressed = deflateRawSync(file.data)
    const checksum = crc32(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(DOS_EPOCH_DATE, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(DOS_EPOCH_DATE, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(file.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, compressed)
    centrals.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

const FORMULA_START = /^[=+\-@\t\r]/

/** One CSV cell: quoted when needed; a leading formula character is neutralized for spreadsheets. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text: string
  if (value instanceof Date) text = value.toISOString()
  else if (typeof value === 'string') text = value
  else if (typeof value === 'number' || typeof value === 'boolean') text = `${value}`
  else text = JSON.stringify(value)
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** RFC 4180 CSV with a header row and CRLF line ends. */
export function toCsv(columns: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return (
    [columns, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\r\n') +
    '\r\n'
  )
}
