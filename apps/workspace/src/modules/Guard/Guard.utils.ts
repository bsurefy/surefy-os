// SPDX-License-Identifier: AGPL-3.0-only
const MICROS_PER_UNIT = 1_000_000
const BASIS_POINTS_PER_PERCENT = 100

/** Amounts travel as micros of the organization's currency (1 = 0.000001). */
export function microsToUnits(micros: number): number {
  return micros / MICROS_PER_UNIT
}

export function unitsToMicros(units: number): number {
  return Math.round(units * MICROS_PER_UNIT)
}

/** Thresholds travel as basis points (9000 = 90%); the screens show whole percents. */
export function basisPointsToPercent(basisPoints: number): number {
  return Math.round(basisPoints / BASIS_POINTS_PER_PERCENT)
}

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * BASIS_POINTS_PER_PERCENT)
}

/** The symbol before an amount in `currency` ("$", "€"), as the locale writes it. */
export function getCurrencySymbol(currency: string, locale?: string): string {
  const part = new Intl.NumberFormat(locale, { style: 'currency', currency })
    .formatToParts(0)
    .find((entry) => entry.type === 'currency')
  return part?.value ?? currency
}
