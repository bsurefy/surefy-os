// SPDX-License-Identifier: AGPL-3.0-only

const DAY_MS = 86_400_000

/** The UTC calendar day of an instant, `YYYY-MM-DD`. */
export const utcDay = (at: Date): string => at.toISOString().slice(0, 10)

/** The first day of a day's UTC month, `YYYY-MM-01`. */
export const monthOf = (day: string): string => `${day.slice(0, 7)}-01`

/** Every UTC day from `first` to `last`, both included. */
export function daysBetween(first: string, last: string): string[] {
  const days: string[] = []
  const end = Date.parse(`${last}T00:00:00Z`)
  for (let at = Date.parse(`${first}T00:00:00Z`); at <= end; at += DAY_MS) {
    days.push(utcDay(new Date(at)))
  }
  return days
}

/** The UTC days a range touches: from the day of `from` to the day after the last instant. */
export function utcDayRange(from: string, to: string): { fromDay: string; toDay: string } {
  const last = new Date(Date.parse(to) - 1)
  return {
    fromDay: utcDay(new Date(from)),
    toDay: utcDay(new Date(Date.parse(utcDay(last)) + DAY_MS)),
  }
}

/** True when the runtime knows the IANA time zone. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Integer micros as a decimal amount for CSV cells (`1250000` → `1.250000`). */
export const microsToAmount = (micros: number): string => (micros / 1_000_000).toFixed(6)
