// SPDX-License-Identifier: AGPL-3.0-only
import type { FileRejection } from './FileDropzone.types'

function matchesType(file: File, accept: string[]) {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept.some((rule) => {
    const pattern = rule.trim().toLowerCase()
    if (pattern.startsWith('.')) return name.endsWith(pattern)
    if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1))
    return type === pattern
  })
}

/** Splits picked or dropped files into accepted ones and rejections (wrong type, too large). */
export function checkFiles(files: File[], accept?: string[], maxSize?: number) {
  const accepted: File[] = []
  const rejected: FileRejection[] = []
  for (const file of files) {
    if (accept?.length && !matchesType(file, accept)) rejected.push({ file, reason: 'type' })
    else if (maxSize !== undefined && file.size > maxSize) rejected.push({ file, reason: 'size' })
    else accepted.push(file)
  }
  return { accepted, rejected }
}

/** "4.2 MB" in the given locale. */
export function formatFileSize(bytes: number, locale?: string) {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const
  let size = bytes
  let unit = 0
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000
    unit += 1
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[unit],
    unitDisplay: unit === 0 ? 'long' : 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(size)
}
