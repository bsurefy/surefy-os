// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'

/**
 * Returns `value` after it has stopped changing for `delayMs` (searches, availability checks,
 * live previews).
 * @example const query = useDebouncedValue(search.trim(), 300)
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])
  return debounced
}
