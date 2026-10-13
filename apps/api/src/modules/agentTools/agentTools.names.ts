// SPDX-License-Identifier: AGPL-3.0-only
import { CALL_NAME_MAX } from './agentTools.constants.js'

/** A name made of what providers accept in a function name; `tool` when nothing is left. */
export function slug(text: string): string {
  // runs collapse to one `_`, so at most one is left to cut at each end
  const cleaned = text
    .normalize('NFKD')
    .replaceAll(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '')
  return cleaned === '' ? 'tool' : cleaned
}

/**
 * Function names for the model, one per base name, in order: cut to the provider limit and made
 * unique with a numeric suffix, so two tools called "Orders" stay two functions.
 */
export function assignCallNames(bases: readonly string[]): string[] {
  const taken = new Set<string>()
  return bases.map((base) => {
    const wanted = base.slice(0, CALL_NAME_MAX)
    let name = wanted
    let n = 1
    while (taken.has(name)) {
      n += 1
      const suffix = `_${String(n)}`
      name = `${wanted.slice(0, CALL_NAME_MAX - suffix.length)}${suffix}`
    }
    taken.add(name)
    return name
  })
}
