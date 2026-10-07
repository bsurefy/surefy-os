// SPDX-License-Identifier: AGPL-3.0-only
/** Reads a number typed in the locale's format ("1.234,5" in de-DE). `null` for empty, `NaN` for junk. */
export function parseNumber(text: string, locale?: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const parts = new Intl.NumberFormat(locale).formatToParts(11_111.1)
  const group = parts.find((part) => part.type === 'group')?.value ?? ','
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.'
  const normalized = trimmed
    .replaceAll(/\s/g, '')
    .replaceAll(group, '')
    .replace(decimal, '.')
    .replace('−', '-')
  // Digits, one sign and one decimal point only; Number() rejects the rest ("1.2.3", "-").
  return /^[-\d.]+$/.test(normalized) ? Number(normalized) : Number.NaN
}

export function clamp(value: number, min?: number, max?: number) {
  if (min !== undefined && value < min) return min
  if (max !== undefined && value > max) return max
  return value
}
